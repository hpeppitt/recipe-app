import type { Favorite } from '../types/recipe';

/**
 * Which local favourites to push to the cloud when `uid` upgrades to a verified
 * account (RL-034). Drops rows for another uid or with no recipe id, and keeps
 * one row per recipe (the earliest), since the cloud doc id is `{uid}_{recipeId}`.
 */
export function selectFavoritesToPush(rows: Favorite[], uid: string): Favorite[] {
  const byRecipe = new Map<string, Favorite>();
  for (const row of rows) {
    if (row.uid !== uid || !row.recipeId) continue;
    const seen = byRecipe.get(row.recipeId);
    if (!seen || row.createdAt < seen.createdAt) byRecipe.set(row.recipeId, row);
  }
  return [...byRecipe.values()];
}
