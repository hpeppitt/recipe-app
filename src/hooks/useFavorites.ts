import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { addFavorite, removeFavorite } from '../db/favorites';
import {
  addCloudFavorite,
  removeCloudFavorite,
  isCloudFavorite,
} from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { trackFavoriteToggled } from '../services/analytics';
import { withTimeout } from '../lib/utils';
import { reportError } from '../services/telemetry';

/** Upper bound on how long a toggle stays locked waiting on the cloud write. */
const FAVORITE_SYNC_TIMEOUT_MS = 5000;

export function useFavoriteIds() {
  const { user } = useAuth();
  const uid = user?.uid;

  const favorites = useLiveQuery(
    () => (uid ? db.favorites.where('uid').equals(uid).toArray() : []),
    [uid]
  );

  const favoriteIds = new Set(favorites?.map((f) => f.recipeId));

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

  const favorite = useLiveQuery(
    () => (uid && recipeId ? db.favorites.get([uid, recipeId]) : undefined),
    [uid, recipeId]
  );

  const isFav = !!favorite;

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

  return { isFavorite: isFav, toggleFavorite: toggle, canFavorite: !!uid };
}

/**
 * Favorite hook for shared/cloud recipes (not in local Dexie).
 *
 * Verified accounts only: the rules deny cloud favourites to anyone else, so an
 * anonymous caller must use `useFavorite` and keep the bookmark on this device.
 */
export function useCloudFavorite(recipeId: string | undefined) {
  const { user } = useAuth();
  const [isFav, setIsFav] = useState(false);
  const togglingRef = useRef(false);

  const verifiedUid = user?.emailVerified ? user.uid : undefined;
  useEffect(() => {
    if (!verifiedUid || !recipeId || !isFirebaseConfigured) return;
    isCloudFavorite(verifiedUid, recipeId).then(setIsFav);
  }, [verifiedUid, recipeId]);

  const toggle = useCallback(
    async (meta: {
      ownerId: string;
      title: string;
      emoji: string;
    }) => {
      if (!user?.emailVerified || !recipeId) return;
      // Same race as useFavorite, but against local state that is only updated
      // after the await: two taps would both see isFav === false.
      if (togglingRef.current) return;
      togglingRef.current = true;

      try {
        if (isFav) {
          await removeCloudFavorite(user.uid, recipeId);
          setIsFav(false);
        } else {
          await addCloudFavorite(
            user.uid,
            recipeId,
            meta.ownerId,
            meta.title,
            meta.emoji,
            user.displayName
          );
          setIsFav(true);
        }
      } finally {
        togglingRef.current = false;
      }
    },
    [user, recipeId, isFav]
  );

  return { isFavorite: isFav, toggleFavorite: toggle };
}
