import { useCallback, useEffect, useState } from 'react';
import { db } from '../db/database';
import { getForestFamily, getUserRecipes } from '../services/firestore';
import { groupForestFamilies } from '../lib/forest';
import { mergeDedupById } from '../lib/search';
import { withTimeout } from '../lib/utils';
import { reportError } from '../services/telemetry';
import type { Recipe } from '../types/recipe';

const LIST_TIMEOUT_MS = 8000;
const FAMILY_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60_000;
/** Another cook's published recipes read for the forest; the rest are only counted as "more". */
export const FOREST_LIST_MAX = 100;

export interface ForestFamilyData {
  /** What is drawn: the bounded family read merged with the person's own versions. */
  recipes: Recipe[];
  /** True number of versions in the family (count query), the drawing may show fewer. */
  count: number;
}

export type ForestState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; families: ForestFamilyData[]; more: number; moreIsLowerBound: boolean; partial: boolean };

// Module caches so coming back to the page, or Retry, does not re-read what already loaded.
// Only successes are stored, so Retry refetches exactly the failed families.
const listCache = new Map<string, { at: number; mine: Recipe[]; truncated: boolean }>();
const familyCache = new Map<string, { at: number; recipes: Recipe[]; count: number }>();
const fresh = <T extends { at: number }>(hit: T | undefined) => (hit && Date.now() - hit.at < CACHE_TTL_MS ? hit : undefined);
export function clearForestCache() {
  listCache.clear();
  familyCache.clear();
}

/**
 * RL-175: the families a person planted or grew in. Reads: own profile = Dexie (0 reads);
 * another cook = one `getUserRecipes` query (at most 100 docs); then per family shown (at most 12)
 * one bounded read (at most 40 docs) plus one count query. A family whose read fails or times out
 * is drawn from the person's own versions and the state is `partial`. Only the list read failing
 * is a whole failure (error + retry).
 */
export function useForest(uid: string | undefined, own: boolean): { state: ForestState; retry: () => void } {
  const key = uid ? `${uid}|${own}` : '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; state: ForestState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const run = async (): Promise<ForestState> => {
      let mine: Recipe[];
      let truncated = false;
      if (own) {
        mine = (await db.recipes.toArray()).filter((r) => r.createdBy?.uid === uid);
      } else {
        let hit = fresh(listCache.get(uid));
        if (!hit) {
          const rows = await withTimeout(getUserRecipes(uid, FOREST_LIST_MAX + 1), LIST_TIMEOUT_MS, null);
          if (!rows) throw new Error('forest list timed out');
          hit = {
            at: Date.now(),
            truncated: rows.length > FOREST_LIST_MAX,
            mine: rows.slice(0, FOREST_LIST_MAX).map((r) => ({ ...r, parentId: (r as Partial<Recipe>).parentId ?? null }) as unknown as Recipe).filter((r) => r.createdBy?.uid === uid),
          };
          listCache.set(uid, hit);
        }
        ({ mine, truncated } = hit);
      }
      const { families, more } = groupForestFamilies(mine);
      let partial = false;
      const data = await Promise.all(
        families.map(async (f): Promise<ForestFamilyData> => {
          let fam = fresh(familyCache.get(f.rootId));
          if (!fam) {
            const got = await withTimeout(getForestFamily(f.rootId).catch((err: unknown) => {
              reportError(err, 'forest-family');
              return null;
            }), FAMILY_TIMEOUT_MS, null);
            if (got) {
              fam = { at: Date.now(), recipes: got.recipes.filter((r) => r.createdBy?.uid).map((r) => ({ ...r, parentId: r.parentId ?? null }) as unknown as Recipe), count: got.count };
              familyCache.set(f.rootId, fam);
            } else partial = true;
          }
          // The person's own rows win over the cloud copy, as useRecipeTree does.
          const recipes = mergeDedupById(f.mine, fam?.recipes ?? [], { limit: Infinity });
          return { recipes, count: Math.max(fam?.count ?? 0, recipes.length) };
        })
      );
      return { status: 'ready', families: data, more, moreIsLowerBound: truncated, partial };
    };
    run()
      .catch((err: unknown) => {
        reportError(err, 'load-forest'); // the real error (a timeout is thrown above as its own Error)
        return { status: 'error' } as ForestState;
      })
      .then((state) => {
        if (!cancelled) setResult({ key, attempt, state });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, own, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: ForestState = result?.key === key && result.attempt === attempt ? result.state : { status: 'loading' };
  return { state, retry };
}
