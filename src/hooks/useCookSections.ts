import { useEffect, useState } from 'react';
import { getProfile } from '../services/firestore';
import { getRecipe } from '../db/recipes';
import { reportError } from '../services/telemetry';
import { useRecentCooks } from './useRecentCooks';
import { readRecent, readRoot } from './recentPublished';
import { cookedThisWeek, familyLeader, mostCooked } from '../lib/cookRanking';
import type { RecentCook } from '../lib/cookRanking';
import type { UserProfile } from '../types/profile';

/** Network reads one section may spend resolving recipes the window and Dexie lack. */
export const RESOLVE_READS_MAX = 8;
/** Distinct cook profiles read per Explore visit. */
export const PROFILE_READS_MAX = 12;
const SPARE = 2;

export type CookedRecipe = {
  id: string;
  rootId: string;
  emoji: string;
  title: string;
  totalTime: number;
  prompt: string;
  parentId: string | null;
  createdBy: { uid: string; displayName: string | null };
  /** Branches in this family within the shared 90 day window; undefined when the window has none. */
  childCount?: number;
};

type Doc = Omit<CookedRecipe, 'childCount' | 'prompt'> & { prompt?: string };
const toCooked = (r: Doc, kids: Map<string, number>): CookedRecipe => ({
  id: r.id,
  rootId: r.rootId,
  emoji: r.emoji,
  title: r.title,
  totalTime: r.totalTime,
  prompt: r.prompt ?? '',
  parentId: r.parentId,
  createdBy: r.createdBy,
  childCount: kids.get(r.rootId),
});

/**
 * Cooks outlive deleted recipes, so ids resolve against: the published window Explore already
 * reads, then Dexie, then `getPublishedRecipe` (cached per session by `readRoot`) for at most
 * `RESOLVE_READS_MAX` of what is still missing, in rank order. Missing or unreadable ones are absent.
 */
async function resolve(ids: readonly string[]): Promise<Map<string, CookedRecipe>> {
  const window = await readRecent('cooked-sections');
  const kids = new Map<string, number>();
  for (const r of window) if (r.parentId) kids.set(r.rootId, (kids.get(r.rootId) ?? 0) + 1);
  const found = new Map<string, Doc>(window.map((r) => [r.id, r] as const));
  const want = [...new Set(ids)];
  for (const id of want) {
    if (found.has(id)) continue;
    const local = await getRecipe(id).catch(() => undefined);
    if (local) found.set(id, local);
  }
  const missing = want.filter((id) => !found.has(id)).slice(0, RESOLVE_READS_MAX);
  const reads = await Promise.all(missing.map((id) => readRoot(id, 'cooked-sections')));
  missing.forEach((id, i) => reads[i] && found.set(id, reads[i]!));
  return new Map(want.flatMap((id) => (found.has(id) ? [[id, toCooked(found.get(id)!, kids)] as const] : [])));
}

export type CookedTile = CookedRecipe & { cooked: number; cookUids: string[] };
type Tiles = { status: 'loading' | 'ready' | 'none'; tiles: CookedTile[] };

/** "Cooked this week": the ranked recipes that still resolve, backfilled from the next ranked, at most 8. */
export function useCookedThisWeek(enabled: boolean): Tiles {
  const { cooks, loading } = useRecentCooks();
  const [state, setState] = useState<{ cooks: RecentCook[]; tiles: CookedTile[] } | null>(null);
  useEffect(() => {
    if (!enabled || loading) return;
    let cancelled = false;
    void (async () => {
      let tiles: CookedTile[] = [];
      try {
        const ranked = cookedThisWeek(cooks, Date.now(), 8 + SPARE);
        const got = ranked.length ? await resolve(ranked.map((r) => r.recipeId)) : new Map<string, CookedRecipe>();
        tiles = ranked.flatMap((r) => (got.has(r.recipeId) ? [{ ...got.get(r.recipeId)!, cooked: r.count, cookUids: r.uids }] : [])).slice(0, 8);
      } catch (err) {
        reportError(err, 'cooked-sections');
      }
      if (!cancelled) setState({ cooks, tiles });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loading, cooks]);
  if (!enabled) return { status: 'none', tiles: [] };
  if (!state || state.cooks !== cooks || loading) return { status: 'loading', tiles: [] };
  return { status: state.tiles.length ? 'ready' : 'none', tiles: state.tiles };
}

export type MostCookedRow = { id: string; emoji: string; title: string; totalTime: number; createdBy: CookedRecipe['createdBy']; count: number; cooked: true; sub?: string };

/** "Most cooked": the top 3 families over 30 or 90 days, each the original, with its leader's branch named once the leader resolves. */
export function useMostCooked(range: '30' | '90'): { status: 'loading' | 'ready' | 'none'; rows: MostCookedRow[] } {
  const { cooks, loading } = useRecentCooks();
  const [state, setState] = useState<{ cooks: RecentCook[]; range: string; rows: MostCookedRow[] } | null>(null);
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void (async () => {
      let rows: MostCookedRow[] = [];
      try {
        const now = Date.now();
        const ranked = mostCooked(cooks, now, Number(range) as 30 | 90, 3 + SPARE);
        const leaders = ranked.map((f) => familyLeader(cooks, f.rootId, now));
        const got = ranked.length ? await resolve([...ranked.map((f) => f.rootId), ...leaders.filter((l): l is string => !!l)]) : new Map<string, CookedRecipe>();
        rows = ranked.flatMap((f, i): MostCookedRow[] => {
          const root = got.get(f.rootId);
          if (!root) return [];
          const lead = leaders[i] ? got.get(leaders[i]!) : undefined;
          const sub = lead && lead.id !== root.id ? lead.prompt || lead.title : undefined;
          return [{ id: root.id, emoji: root.emoji, title: root.title, totalTime: root.totalTime, createdBy: root.createdBy, count: f.count, cooked: true, sub }];
        });
      } catch (err) {
        reportError(err, 'cooked-sections');
      }
      if (!cancelled) setState({ cooks, range, rows: rows.slice(0, 3) });
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, cooks, range]);
  if (loading || !state || state.cooks !== cooks || state.range !== range) return { status: 'loading', rows: [] };
  return { status: state.rows.length ? 'ready' : 'none', rows: state.rows };
}

// Module state for the page session; a failed read is dropped so the next visit retries.
const profileReads = new Map<string, Promise<UserProfile | null>>();
export function clearCookProfileCache() {
  profileReads.clear();
}
function readProfile(uid: string) {
  let p = profileReads.get(uid);
  if (!p) {
    p = getProfile(uid).catch(() => {
      profileReads.delete(uid);
      return null;
    });
    profileReads.set(uid, p);
  }
  return p;
}

/** Profiles for the cooks' avatars: at most `PROFILE_READS_MAX` distinct uids, deduped and cached; a failed read leaves the generic avatar. */
export function useCookProfiles(uids: readonly string[]): ReadonlyMap<string, UserProfile> {
  const key = [...new Set(uids)].slice(0, PROFILE_READS_MAX).join();
  const [state, setState] = useState<{ key: string; map: Map<string, UserProfile> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void Promise.all(key.split(',').map(async (u) => [u, await readProfile(u)] as const)).then((pairs) => {
      if (!cancelled) setState({ key, map: new Map(pairs.flatMap(([u, p]) => (p ? [[u, p] as const] : []))) });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state?.key === key ? state.map : new Map();
}
