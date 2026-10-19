import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAuth } from '../contexts/AuthContext';
import { getPublishedRecipe } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { buildSavedList, splitLibrary, type FavoriteFetch } from '../lib/library';
import { withTimeout } from '../lib/utils';
import { useLocalLibrary } from './useRecipeLibrary';

const READ_TIMEOUT_MS = 8000;

/** Results (recipe or missing) kept for the page session, so returning to Saved costs no reads. Failures are never stored. */
const sessionCache = new Map<string, FavoriteFetch>();

/** Test use only: the cache is module state and would leak between tests. */
export function clearSavedFavoritesCache() {
  sessionCache.clear();
}

async function fetchOne(id: string): Promise<FavoriteFetch> {
  // withTimeout swallows rejections, so report them before it sees the promise.
  const read = getPublishedRecipe(id).catch((err) => {
    reportError(err, 'saved-favorite-read');
    return undefined;
  });
  const recipe = await withTimeout(read, READ_TIMEOUT_MS, undefined);
  if (recipe === undefined) return { status: 'failed' };
  return recipe ? { status: 'recipe', recipe } : { status: 'missing' };
}

/**
 * The Saved page's rows: saved copies plus the user's favourites (RL-121).
 * Read only. A favourite whose recipe is not on the device is read from the
 * cloud once per session and never cached in Dexie.
 *
 * shortcut: one `getDoc` per favourited recipe not on the device, per session
 * (200 such favourites cost 200 reads); upgrade to a batched `documentId() in`
 * query if favourite counts grow.
 */
export function useSavedFavorites() {
  const { user, isConfigured } = useAuth();
  const uid = user?.uid;
  const recipes = useLocalLibrary();
  const favorites = useLiveQuery(
    () => (uid && isConfigured ? db.favorites.where('uid').equals(uid).toArray() : []),
    [uid, isConfigured]
  );
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const inFlight = useRef(new Set<string>());
  const [retrying, setRetrying] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const built = useMemo(() => {
    if (!recipes || !favorites) return undefined;
    const saved = splitLibrary(recipes, recipes, { uid, isConfigured }).saved;
    void version;
    const fetched = new Map(sessionCache);
    for (const id of failed) fetched.set(id, { status: 'failed' });
    return buildSavedList(recipes, saved, favorites, fetched, uid);
    // `version` stands for sessionCache, which is module state.
  }, [recipes, favorites, failed, uid, isConfigured, version]);

  const toFetch = built?.toFetch;
  useEffect(() => {
    if (!toFetch || !online) return;
    const ids = toFetch.filter((id) => !inFlight.current.has(id));
    for (const id of ids) inFlight.current.add(id);
    for (const id of ids) {
      void fetchOne(id).then((result) => {
        inFlight.current.delete(id);
        if (inFlight.current.size === 0) setRetrying(false);
        if (result.status === 'failed') setFailed((prev) => new Set(prev).add(id));
        else {
          sessionCache.set(id, result);
          bump();
        }
      });
    }
  }, [toFetch, online]);

  const retry = useCallback(() => {
    setRetrying(true);
    setFailed(new Set());
  }, []);

  const pending = built?.toFetch.length ?? 0;
  return {
    // Skeleton until Dexie answers, or while the first reads run and nothing is known to show.
    isLoading: !built || (built.rows.length === 0 && pending > 0 && online && !retrying),
    rows: built?.rows ?? [],
    deletedCount: built?.deletedCount ?? 0,
    failedCount: built?.failedCount ?? 0,
    offlineCount: online ? 0 : pending,
    retrying,
    retry,
  };
}
