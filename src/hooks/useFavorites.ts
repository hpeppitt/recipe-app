import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { addFavorite, removeFavorite, addMissingFavorites } from '../db/favorites';
import {
  addCloudFavorite,
  removeCloudFavorite,
  isCloudFavorite,
  getCloudFavorites,
} from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { trackFavoriteToggled } from '../services/analytics';
import { withTimeout } from '../lib/utils';
import { reportError } from '../services/telemetry';
import { TOGGLE_ERROR, boundedWrite } from './useFollow';

/** Upper bound on how long a toggle stays locked waiting on the cloud write. */
const FAVORITE_SYNC_TIMEOUT_MS = 5000;

/**
 * Each uid's cloud favourites read in this tab, so a remount or auth refresh does not refetch.
 * Resolves (never rejects) once the read and the local add have settled, either way.
 */
const hydrations = new Map<string, Promise<void>>();

/**
 * Once per session per verified uid, add the cloud favourites this device lacks
 * (RL-043). Anonymous and signed-out users never fetch. A failed read is not
 * retried until the next session.
 */
function useHydrateFavorites(): boolean {
  const { user, isLoading } = useAuth();
  const uid = !isLoading && user && !user.isAnonymous && user.emailVerified ? user.uid : undefined;
  // The uid whose hydrate has settled, so a caller can wait for it (RL-136).
  const [settledUid, setSettledUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return;
    let done = hydrations.get(uid);
    if (!done) {
      done = getCloudFavorites(uid).then(
        async (rows) => {
          if (!rows) return;
          try {
            await addMissingFavorites(uid, rows);
          } catch (err) {
            console.error('Adding cloud favourites locally failed', err);
            reportError(err, 'favorites-hydrate-local');
          }
        },
        () => {}
      );
      hydrations.set(uid, done);
    }
    let cancelled = false;
    void done.then(() => {
      if (!cancelled) setSettledUid(uid);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return !uid || !isFirebaseConfigured || settledUid === uid;
}

export function useFavoriteIds() {
  const { user } = useAuth();
  const uid = user?.uid;
  useHydrateFavorites();

  const favorites = useLiveQuery(
    () => (uid ? db.favorites.where('uid').equals(uid).toArray() : []),
    [uid]
  );

  // Memoised on the live-query array so useRecipeLibrary's useMemo can hold.
  const favoriteIds = useMemo(() => new Set(favorites?.map((f) => f.recipeId)), [favorites]);

  return {
    favoriteIds,
    // Favourites are keyed by uid, so with no signed-in user none can ever exist
    // and a Favorites filter would be permanently empty (FUN-16).
    canFavorite: !!uid,
    isLoading: favorites === undefined,
  };
}

export function useFavorite(recipeId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.uid;
  // Anonymous accounts bookmark on this device only (decision 1a): the rules
  // deny their cloud favourite writes, so they are never attempted.
  const syncsToCloud = isFirebaseConfigured && !!user?.emailVerified;
  const togglingRef = useRef(false);
  // Also here, so a deep link to a recipe hydrates without visiting the Library first.
  const hydrated = useHydrateFavorites();
  // Stamped with its key, so `ready` is false while a stale result shows. `hydrated` is in the
  // key so the query re-reads after the cloud rows land, not before.
  const key = `${uid}:${recipeId}:${hydrated}`;

  const favorite = useLiveQuery(
    async () => ({ key, row: uid && recipeId ? await db.favorites.get([uid, recipeId]) : undefined }),
    [key]
  );

  const isFav = !!favorite?.row;

  const toggle = useCallback(
    async (meta?: {
      ownerId: string;
      title: string;
      emoji: string;
    }) => {
      if (!uid || !recipeId) return;
      // `isFav` comes from a live query, so two taps inside the same tick both
      // read the pre-toggle value and both take the "add" branch — two
      // increment(1) writes against a single favourite doc, inflating the count
      // for good. The ref closes that window; the local write is idempotent but
      // the cloud counter is not.
      if (togglingRef.current) return;
      togglingRef.current = true;

      try {
        trackFavoriteToggled(recipeId, !isFav);
        if (isFav) {
          await removeFavorite(uid, recipeId);
          if (syncsToCloud) {
            // Awaited so the guard spans the counter write, but bounded: an
            // unreachable Firestore retries for a long time and must not leave
            // the button permanently locked.
            await withTimeout(
              removeCloudFavorite(uid, recipeId).catch((err) => {
                console.error('Removing cloud favourite failed', err);
                reportError(err, 'unfavorite');
              }),
              FAVORITE_SYNC_TIMEOUT_MS,
              undefined
            );
          }
        } else {
          await addFavorite(uid, recipeId);
          if (syncsToCloud && meta) {
            await withTimeout(
              addCloudFavorite(
                uid,
                recipeId,
                meta.ownerId,
                meta.title,
                meta.emoji,
                user?.displayName ?? null
              ).catch((err) => {
                console.error('Adding cloud favourite failed', err);
                reportError(err, 'favorite');
              }),
              FAVORITE_SYNC_TIMEOUT_MS,
              undefined
            );
          }
        }
      } finally {
        togglingRef.current = false;
      }
    },
    [uid, recipeId, isFav, user?.displayName, syncsToCloud]
  );

  return { isFavorite: isFav, toggleFavorite: toggle, canFavorite: !!uid, ready: hydrated && favorite?.key === key };
}

/**
 * Favorite hook for shared/cloud recipes (not in local Dexie).
 *
 * Verified accounts only: the rules deny cloud favourites to anyone else, so an
 * anonymous caller must use `useFavorite` and keep the bookmark on this device.
 */
export function useCloudFavorite(recipeId: string | undefined) {
  const { user } = useAuth();
  const togglingRef = useRef(false);
  const keyRef = useRef<string | undefined>(undefined);

  const verifiedUid = user?.emailVerified ? user.uid : undefined;
  const key = verifiedUid && recipeId ? `${verifiedUid}:${recipeId}` : undefined;
  // State stamped with its key, same pattern as useFollow.
  const [lookup, setLookup] = useState<{ key: string; fav: boolean } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (!key || !verifiedUid || !recipeId || !isFirebaseConfigured) return;
    let cancelled = false;
    isCloudFavorite(verifiedUid, recipeId)
      .then((fav) => {
        if (!cancelled) setLookup({ key, fav });
      })
      .catch((err) => {
        console.error('Favourite lookup failed', err);
        reportError(err, 'favorite-lookup');
        if (!cancelled) setLookup({ key, fav: false });
      });
    return () => {
      cancelled = true;
    };
  }, [key, verifiedUid, recipeId]);

  const isFav = !!key && lookup?.key === key && lookup.fav;

  const toggle = useCallback(
    async (meta: {
      ownerId: string;
      title: string;
      emoji: string;
    }) => {
      if (!user?.emailVerified || !recipeId || !key) return;
      // Same race as useFavorite, but against local state that is only updated
      // after the await: two taps would both see isFav === false.
      if (togglingRef.current) return;
      togglingRef.current = true;
      setFailure(null);

      try {
        // Bounded like useFavorite: offline the SDK promise stays pending and would
        // lock the guard with no error. shortcut: a timed-out write may still commit
        // when connectivity returns, so the UI can differ from the server until the
        // next lookup.
        const write = isFav
          ? removeCloudFavorite(user.uid, recipeId)
          : addCloudFavorite(user.uid, recipeId, meta.ownerId, meta.title, meta.emoji, user.displayName);
        await boundedWrite(write, FAVORITE_SYNC_TIMEOUT_MS);
        // Drop the result if the user has moved to another recipe meanwhile.
        if (keyRef.current === key) setLookup({ key, fav: !isFav });
      } catch (err) {
        console.error('Toggling cloud favourite failed', err);
        reportError(err, isFav ? 'unfavorite' : 'favorite');
        setFailure({ key, message: TOGGLE_ERROR });
      } finally {
        togglingRef.current = false;
      }
    },
    [user, recipeId, key, isFav]
  );

  return {
    isFavorite: isFav,
    toggleFavorite: toggle,
    error: !!key && failure?.key === key ? failure.message : null,
    ready: !!key && lookup?.key === key,
  };
}
