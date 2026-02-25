import { db } from './database';

export async function addFavorite(uid: string, recipeId: string): Promise<void> {
  await db.favorites.put({ uid, recipeId, createdAt: Date.now() });
}

export async function removeFavorite(uid: string, recipeId: string): Promise<void> {
  await db.favorites.delete([uid, recipeId]);
}

export async function migrateFavoritesUid(
  oldUid: string,
  newUid: string
): Promise<number> {
  const favs = await db.favorites.where('uid').equals(oldUid).toArray();
  for (const fav of favs) {
    await db.favorites.delete([oldUid, fav.recipeId]);
    await db.favorites.put({ uid: newUid, recipeId: fav.recipeId, createdAt: fav.createdAt });
  }
  return favs.length;
}
