import { db } from './database';

export async function addFavorite(uid: string, recipeId: string): Promise<void> {
  await db.favorites.put({ uid, recipeId, createdAt: Date.now() });
}

export async function removeFavorite(uid: string, recipeId: string): Promise<void> {
  await db.favorites.delete([uid, recipeId]);
}
