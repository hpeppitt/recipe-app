import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { getUserRecipes, getRecipesByUsers } from '../services/firestore';
import { reportError } from '../services/telemetry';
import type { SharedRecipe } from '../lib/share';

type CloudRecipe = SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number };
const EMPTY_RECIPES: CloudRecipe[] = [];

/** Own profile: local Dexie recipes enriched with Firestore stats */
export function useOwnRecipes(uid: string | undefined) {
  const localRecipes = useLiveQuery(
    () => (uid ? db.recipes.filter((r) => r.createdBy.uid === uid).reverse().sortBy('createdAt') : []),
    [uid]
  );

  const [stats, setStats] = useState<Map<string, { viewCount: number; favoriteCount: number }>>(
    new Map()
  );

  useEffect(() => {
    if (!localRecipes || localRecipes.length === 0) return;
    if (!uid) return;
    // One query for every published recipe of this user; unpublished ones are simply absent.
    getUserRecipes(uid)
      .then((published) =>
        setStats(new Map(published.map((r) => [r.id, { viewCount: r.viewCount || 0, favoriteCount: r.favoriteCount || 0 }])))
      )
      .catch(() => {});
  }, [uid, localRecipes?.map((r) => r.id).join(',')]);

  const recipes = (localRecipes ?? []).map((r) => ({
    id: r.id,
    emoji: r.emoji,
    title: r.title,
    description: r.description,
    viewCount: stats.get(r.id)?.viewCount ?? 0,
    favoriteCount: stats.get(r.id)?.favoriteCount ?? 0,
    createdAt: r.createdAt,
  }));

  const totals = {
    totalViews: recipes.reduce((sum, r) => sum + r.viewCount, 0),
    totalFavorites: recipes.reduce((sum, r) => sum + r.favoriteCount, 0),
  };

  return { recipes, stats: totals, isLoading: localRecipes === undefined };
}

/** Public profile or other user: Firestore only */
export function useUserRecipes(uid: string | undefined) {
  // Stamped with the uid it belongs to, so profile A's late response never renders
  // under profile B and loading is derived rather than set in the effect body.
  const [state, setState] = useState<{ uid: string; recipes: CloudRecipe[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getUserRecipes(uid)
      .then((recipes) => {
        if (!cancelled) setState({ uid, recipes });
      })
      .catch((err) => {
        console.error('Loading user recipes failed', err);
        reportError(err, 'load-user-recipes');
        if (!cancelled) setState({ uid, recipes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const settled = !!uid && state?.uid === uid;
  const recipes = settled ? state.recipes : EMPTY_RECIPES;
  const stats = {
    totalViews: recipes.reduce((sum, recipe) => sum + (recipe.viewCount || 0), 0),
    totalFavorites: recipes.reduce((sum, recipe) => sum + (recipe.favoriteCount || 0), 0),
  };
  return { recipes, stats, isLoading: !!uid && !settled };
}

export function useFollowingRecipes(followingIds: string[]) {
  const key = followingIds.join(',');
  const [state, setState] = useState<{ key: string; recipes: CloudRecipe[] } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getRecipesByUsers(key.split(','))
      .then((recipes) => {
        if (!cancelled) setState({ key, recipes });
      })
      .catch((err) => {
        console.error('Loading following recipes failed', err);
        reportError(err, 'load-following-recipes');
        if (!cancelled) setState({ key, recipes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const settled = !!key && state?.key === key;
  return { recipes: settled ? state.recipes : EMPTY_RECIPES, isLoading: !!key && !settled };
}
