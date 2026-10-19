import { useEffect, useRef, useState } from 'react';
import { getPublishedRecipe, getRecentPublishedRecipes, type PublishedRecipe } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { branchingThisWeek, buildFeed, WEEK_MS, type FeedRecipe } from '../lib/library';
import { withTimeout } from '../lib/utils';

const TIMEOUT_MS = 6000;

export type BranchingTile = FeedRecipe & { weekCount: number };
type Result = { status: 'loading' | 'ready' | 'none'; tiles: BranchingTile[] };

// Read only, module state for the page session: one week query, one read per unknown root.
// A failure is cached too, so a broken query is not retried on every Explore visit.
let weekQuery: Promise<PublishedRecipe[]> | undefined;
const rootReads = new Map<string, Promise<PublishedRecipe | null>>();

/** Test use only: the caches are module state and would leak between tests. */
export function clearBranchingThisWeekCache() {
  weekQuery = undefined;
  rootReads.clear();
}

// withTimeout swallows rejections, so report them before it sees the promise.
const TIMED_OUT = Symbol('timed out');
async function bounded<T>(read: Promise<T>, fallback: T): Promise<T> {
  const out = await withTimeout<T | typeof TIMED_OUT>(
    read.catch((err) => {
      reportError(err, 'branching-week');
      return fallback;
    }),
    TIMEOUT_MS,
    TIMED_OUT
  );
  if (out !== TIMED_OUT) return out;
  reportError(new Error('branching-week timeout'), 'branching-week');
  return fallback;
}

function readWeek(): Promise<PublishedRecipe[]> {
  weekQuery ??= bounded(getRecentPublishedRecipes(Date.now() - WEEK_MS), [] as PublishedRecipe[]);
  return weekQuery;
}

function readRoot(id: string): Promise<PublishedRecipe | null> {
  let p = rootReads.get(id);
  if (!p) {
    p = bounded<PublishedRecipe | null>(getPublishedRecipe(id) as Promise<PublishedRecipe | null>, null);
    rootReads.set(id, p);
  }
  return p;
}

/**
 * Organic 1b's "Branching fast this week" (RL-126): the families with the most new branches in
 * the last 7 days. `loaded` is Explore's feed, used before spending a read on a root.
 * Never writes to Dexie or Firestore.
 */
export function useBranchingThisWeek(enabled: boolean, loaded: readonly FeedRecipe[]): Result {
  const [result, setResult] = useState<Result>({ status: 'loading', tiles: [] });
  // The feed is rebuilt every render, so key the effect on its ids and read the rows from a ref.
  const loadedRef = useRef(loaded);
  useEffect(() => {
    loadedRef.current = loaded;
  });
  const loadedKey = loaded.map((r) => r.id).join();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const recent = await readWeek();
      const families = branchingThisWeek(recent, Date.now());
      const known = new Map<string, PublishedRecipe | FeedRecipe>([
        ...loadedRef.current.map((r) => [r.id, r] as const),
        ...recent.filter((r) => !r.parentId).map((r) => [r.id, r] as const),
      ]);
      const tiles: BranchingTile[] = [];
      const roots = await Promise.all(families.map((f) => known.get(f.rootId) ?? readRoot(f.rootId)));
      families.forEach((f, i) => {
        const root = roots[i];
        const feed = root ? buildFeed([root], [])[0] : undefined;
        if (feed) tiles.push({ ...feed, weekCount: f.weekCount });
      });
      if (!cancelled) setResult({ status: tiles.length > 0 ? 'ready' : 'none', tiles });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loadedKey]);

  return enabled ? result : { status: 'none', tiles: [] };
}
