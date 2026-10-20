import { useEffect, useRef, useState } from 'react';
import type { PublishedRecipe } from '../services/firestore';
import { readRecent, readRoot } from './recentPublished';
import { branchingThisWeek, buildFeed, type FeedRecipe } from '../lib/library';

export type BranchingTile = FeedRecipe & { weekCount: number };
type Result = { status: 'loading' | 'ready' | 'none'; tiles: BranchingTile[] };

export { clearRecentPublishedCache as clearBranchingThisWeekCache } from './recentPublished';

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
      const recent = await readRecent('branching-week');
      const families = branchingThisWeek(recent, Date.now());
      const known = new Map<string, PublishedRecipe | FeedRecipe>([
        ...loadedRef.current.map((r) => [r.id, r] as const),
        ...recent.filter((r) => !r.parentId).map((r) => [r.id, r] as const),
      ]);
      const tiles: BranchingTile[] = [];
      const roots = await Promise.all(families.map((f) => known.get(f.rootId) ?? readRoot(f.rootId, 'branching-week')));
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
