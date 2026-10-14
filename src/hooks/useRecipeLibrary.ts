import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllRecipes } from '../db/recipes';
import {
  getPublishedRecipesPage,
  type PublishedRecipe,
  type FeedCursor,
} from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { withTimeout } from '../lib/utils';
import { reportError } from '../services/telemetry';

/** How long Explore waits for the shared library before reporting it unreachable. */
const LIBRARY_CLOUD_TIMEOUT_MS = 6000;

/**
 * My Recipes: every recipe on this device, roots and variations alike (the
 * variations are needed for the descendant counts). A Dexie live query, so it
 * works offline and in local-only mode. Undefined while the first read runs.
 */
export function useLocalLibrary() {
  return useLiveQuery(() => getAllRecipes(), []);
}

/**
 * Explore: the shared library, cursor-paged newest first.
 *
 * Nothing is read until `enabled` first turns true, so a visit that never opens
 * Explore costs no Firestore reads. Pages already fetched are kept across tab
 * switches.
 */
export function useCloudLibrary(enabled: boolean) {
  const [cloudRecipes, setCloudRecipes] = useState<PublishedRecipe[] | null>(null);
  // Cursor pagination replaces a hard `limit(200)`: beyond 200 published recipes
  // the rest of the library was simply unreachable, and every visit re-read all
  // 200 whether or not the user scrolled.
  const [cursor, setCursor] = useState<FeedCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // A failed page used to be silent: the button re-enabled and nothing said why.
  const [loadMoreError, setLoadMoreError] = useState(false);
  // Failing to reach the shared library used to be indistinguishable from it
  // being empty, so an offline user was told "No recipes yet" (UI-12).
  const [cloudError, setCloudError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [started, setStarted] = useState(false);
  if (enabled && !started && isFirebaseConfigured) setStarted(true);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    setCloudRecipes(null);
    setCloudError(false);
    // Bounded: against an unreachable backend Firestore retries rather than
    // rejecting, so a plain .catch() never fires and the feed would sit silently
    // in a loading state forever. A timeout is treated as a failure.
    withTimeout(
      getPublishedRecipesPage().catch((err) => {
        console.error('Loading the shared library failed', err);
        reportError(err, 'load-library');
        return null;
      }),
      LIBRARY_CLOUD_TIMEOUT_MS,
      null
    ).then((result) => {
      if (cancelled) return;
      setCloudRecipes(result ? result.recipes : []);
      setCursor(result?.cursor ?? null);
      setHasMore(result?.hasMore ?? false);
      setCloudError(result === null);
    });
    return () => {
      cancelled = true;
    };
  }, [started, reloadKey]);

  /**
   * Append the next page.
   *
   * Guarded on `loadingMore` so a double-tap cannot fetch the same page twice.
   * `buildFeed` dedups by id, so the visible symptom would be a wasted read
   * rather than duplicates, but it is still a wasted read.
   *
   * A failed page load leaves the cursor untouched, so the button stays and
   * pressing it again retries the same page rather than skipping it.
   */
  const loadMore = async () => {
    if (!isFirebaseConfigured || !hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const next = await getPublishedRecipesPage(cursor);
      setCloudRecipes((prev) => [...(prev ?? []), ...next.recipes]);
      setCursor(next.cursor);
      setHasMore(next.hasMore);
    } catch (err) {
      console.error('Loading more of the shared library failed', err);
      reportError(err, 'load-library-page');
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    /** Every record in the pages fetched so far; null until the first page lands. */
    recipes: cloudRecipes,
    isLoading: started && cloudRecipes === null,
    /** True when the shared library could not be reached. */
    cloudError,
    retryCloud: () => setReloadKey((k) => k + 1),
    /**
     * Not suppressed by search or the favourites filter any more: the tabs make
     * it clear those apply to the pages fetched so far, and the page says so.
     */
    hasMore,
    loadingMore,
    /** True when the last Load more failed; pages already fetched are kept. */
    loadMoreError,
    loadMore,
  };
}
