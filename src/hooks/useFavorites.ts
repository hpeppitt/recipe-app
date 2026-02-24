import { useState, useEffect, useCallback } from 'react';
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

export function useFavoriteIds() {
  const { user } = useAuth();
  const uid = user?.uid;

  const favorites = useLiveQuery(
    () => (uid ? db.favorites.where('uid').equals(uid).toArray() : []),
    [uid]
  );

  const favoriteIds = new Set(favorites?.map((f) => f.recipeId));

  return { favoriteIds, isLoading: favorites === undefined };
}

export function useFavorite(recipeId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.uid;

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
      if (isFav) {
        await removeFavorite(uid, recipeId);
        if (isFirebaseConfigured) {
          removeCloudFavorite(uid, recipeId).catch(() => {});
        }
      } else {
        await addFavorite(uid, recipeId);
        if (isFirebaseConfigured && meta) {
          addCloudFavorite(
            uid,
            recipeId,
            meta.ownerId,
            meta.title,
            meta.emoji,
            user?.displayName ?? null
          ).catch(() => {});
        }
      }
    },
    [uid, recipeId, isFav, user?.displayName]
  );

  return { isFavorite: isFav, toggleFavorite: toggle };
}

/** Favorite hook for shared/cloud recipes (not in local Dexie) */
export function useCloudFavorite(recipeId: string | undefined) {
  const { user } = useAuth();
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    if (!user || !recipeId || !isFirebaseConfigured) return;
    isCloudFavorite(user.uid, recipeId).then(setIsFav);
  }, [user?.uid, recipeId]);

  const toggle = useCallback(
    async (meta: {
      ownerId: string;
      title: string;
      emoji: string;
    }) => {
      if (!user || !recipeId) return;
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
    },
    [user, recipeId, isFav]
  );

  return { isFavorite: isFav, toggleFavorite: toggle };
}
