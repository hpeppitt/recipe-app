import { useState, useEffect } from 'react';
import { getUserRecipes, getRecipesByUsers } from '../services/firestore';
import type { SharedRecipe } from '../lib/share';

type CloudRecipe = SharedRecipe & { id: string; favoriteCount: number; viewCount: number };

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
    getUserRecipes(uid).then((r) => {
      setRecipes(r);
      setStats({
        totalViews: r.reduce((sum, recipe) => sum + (recipe.viewCount || 0), 0),
        totalFavorites: r.reduce((sum, recipe) => sum + (recipe.favoriteCount || 0), 0),
      });
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
    getRecipesByUsers(followingIds).then((r) => {
      setRecipes(r);
      setIsLoading(false);
    });
  }, [followingIds.join(',')]);

  return { recipes, isLoading };
}
