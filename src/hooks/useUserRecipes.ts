import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { getUserRecipes, getRecipesByUsers, getRecipeStats } from '../services/firestore';
import type { SharedRecipe } from '../lib/share';

type CloudRecipe = SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number };

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
    const ids = localRecipes.map((r) => r.id);
    getRecipeStats(ids)
      .then(setStats)
      .catch(() => {});
  }, [localRecipes?.map((r) => r.id).join(',')]);

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
  const [recipes, setRecipes] = useState<CloudRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalViews: 0, totalFavorites: 0 });

  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    getUserRecipes(uid)
      .then((r) => {
        setRecipes(r);
        setStats({
          totalViews: r.reduce((sum, recipe) => sum + (recipe.viewCount || 0), 0),
          totalFavorites: r.reduce((sum, recipe) => sum + (recipe.favoriteCount || 0), 0),
        });
        setIsLoading(false);
      })
      .catch(() => {
        setRecipes([]);
        setIsLoading(false);
      });
  }, [uid]);

  return { recipes, stats, isLoading };
}

export function useFollowingRecipes(followingIds: string[]) {
  const [recipes, setRecipes] = useState<CloudRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (followingIds.length === 0) {
      setRecipes([]);
      return;
    }
    setIsLoading(true);
    getRecipesByUsers(followingIds)
      .then((r) => {
        setRecipes(r);
        setIsLoading(false);
      })
      .catch(() => {
        setRecipes([]);
        setIsLoading(false);
      });
  }, [followingIds.join(',')]);

  return { recipes, isLoading };
}
