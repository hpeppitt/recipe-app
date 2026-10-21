import { useEffect, useState } from 'react';
import { isFirebaseConfigured } from '../services/firebase';
import { buildFeed, mostBranched, type FeedRecipe } from '../lib/library';
import { RECENT_DAYS, RECENT_MAX, readRecentOrFail, readRoot } from './recentPublished';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 3;

export type MostBranchedRange = '30' | '90';
export type MostBranchedTile = FeedRecipe & { count: number };
type Result = {
  status: 'loading' | 'ready' | 'none' | 'error';
  tiles: MostBranchedTile[];
  /** Always false: there is no all-time read (RL-166), so "All time" is never offered. */
  allTimeAvailable: false;
  /** Oldest time the read fully covers; a range starting before it is undercounted. */
  coverageStartMs: number;
  /** True when this range starts before `coverageStartMs`. */
  capped: boolean;
  /** Starts the read again after an 'error'. */
  retry: () => void;
};
const EMPTY = { retry: () => {}, tiles: [] as MostBranchedTile[], allTimeAvailable: false as const, coverageStartMs: 0, capped: false };

/**
 * Organic 1b's "Most branched" (RL-166): the top three families by branches in the last 30 or 90
 * days, ranked in memory from the read Branching fast this week shares.
 * shortcut: counts only the newest 100 published recipes of the last 90 days, upgrade to a
 * server-side counter. Never writes to Dexie or Firestore; reads nothing in local-only mode.
 */
export function useMostBranched(range: MostBranchedRange, enabled = true): Result {
  const [state, setState] = useState<(Omit<Result, 'retry'> & { range: MostBranchedRange }) | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled) return;
    let cancelled = false;
    void (async () => {
      const read = await readRecentOrFail('most-branched');
      if (!read) {
        if (!cancelled) setState({ range, status: 'error', ...EMPTY, capped: false });
        return;
      }
      const library = read;
      const now = Date.now();
      const sinceMs = now - Number(range) * DAY_MS;
      const full = library.length >= RECENT_MAX;
      const coverageStartMs = full ? Math.min(...library.map((r) => r.createdAt)) : now - RECENT_DAYS * DAY_MS;
      // Rank six so a deleted root does not leave a gap, then keep three.
      const families = mostBranched(library, { sinceMs, now, limit: TOP * 2 });
      const known = new Map(library.filter((r) => !r.parentId).map((r) => [r.id, r] as const));
      const roots = await Promise.all(families.map((f) => known.get(f.rootId) ?? readRoot(f.rootId, 'most-branched')));
      const tiles: MostBranchedTile[] = [];
      families.forEach((f, i) => {
        const feed = roots[i] ? buildFeed([roots[i]!], [])[0] : undefined;
        if (feed) tiles.push({ ...feed, count: f.count });
      });
      const top = tiles.slice(0, TOP);
      if (!cancelled)
        setState({ range, status: top.length > 0 ? 'ready' : 'none', tiles: top, allTimeAvailable: false, coverageStartMs, capped: sinceMs < coverageStartMs });
    })();
    return () => {
      cancelled = true;
    };
  }, [range, attempt, enabled]);

  const retry = () => {
    setState(null);
    setAttempt((n) => n + 1);
  };
  if (!isFirebaseConfigured || !enabled) return { status: 'none', ...EMPTY };
  // Results from another range never show under this range's label.
  return state && state.range === range ? { ...state, retry } : { status: 'loading', ...EMPTY, retry };
}
