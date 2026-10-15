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

/** A cloud `favorites/{uid}_{recipeId}` document as read, unchecked: the rules do not validate its fields. */
export interface CloudFavoriteRow {
  uid?: unknown;
  recipeId?: unknown;
  createdAt?: unknown;
}

/**
 * Which cloud favourites of `uid` to add to Dexie on sign-in (RL-043). Drops rows
 * for another uid, with no recipe id or with a non-numeric createdAt, recipes
 * already favourited locally, and recipes in `removed` (unfavourited on this
 * device this session, so a stale cloud read must not bring them back). One row
 * per recipe, the earliest, sorted by recipe id. Keeps the cloud createdAt.
 */
export function selectFavoritesToHydrate(
  cloudRows: readonly CloudFavoriteRow[],
  localRows: readonly Favorite[],
  uid: string,
  removed: ReadonlySet<string> = new Set()
): Favorite[] {
  const local = new Set(localRows.filter((r) => r.uid === uid).map((r) => r.recipeId));
  const byRecipe = new Map<string, Favorite>();
  for (const row of cloudRows) {
    const { recipeId, createdAt } = row;
    if (row.uid !== uid || typeof recipeId !== 'string' || !recipeId) continue;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) continue;
    if (local.has(recipeId) || removed.has(recipeId)) continue;
    const seen = byRecipe.get(recipeId);
    if (!seen || createdAt < seen.createdAt) byRecipe.set(recipeId, { uid, recipeId, createdAt });
  }
  return [...byRecipe.values()].sort((a, b) => (a.recipeId < b.recipeId ? -1 : a.recipeId > b.recipeId ? 1 : 0));
}
