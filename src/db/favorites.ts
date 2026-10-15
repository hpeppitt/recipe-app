import { db } from './database';
import { selectFavoritesToHydrate, type CloudFavoriteRow } from '../lib/favoritesMigration';

/**
 * `uid:recipeId` keys unfavourited on this device this session, so a cloud read
 * that started before the removal cannot re-add it (RL-043).
 */
const removedThisSession = new Set<string>();

export async function addFavorite(uid: string, recipeId: string): Promise<void> {
  removedThisSession.delete(`${uid}:${recipeId}`);
  await db.favorites.put({ uid, recipeId, createdAt: Date.now() });
}

export async function removeFavorite(uid: string, recipeId: string): Promise<void> {
  removedThisSession.add(`${uid}:${recipeId}`);
  await db.favorites.delete([uid, recipeId]);
}

/**
 * Add the cloud favourites of `uid` that this device lacks (RL-043). Reads the
 * local rows inside the transaction, so a favourite added or removed while the
 * cloud read was in flight wins. Never overwrites or deletes. Returns the count added.
 */
export async function addMissingFavorites(uid: string, cloudRows: readonly CloudFavoriteRow[]): Promise<number> {
  return db.transaction('rw', db.favorites, async () => {
    const local = await db.favorites.where('uid').equals(uid).toArray();
    const removed = new Set(
      [...removedThisSession].filter((k) => k.startsWith(`${uid}:`)).map((k) => k.slice(uid.length + 1))
    );
    const rows = selectFavoritesToHydrate(cloudRows, local, uid, removed);
    await db.favorites.bulkAdd(rows);
    return rows.length;
  });
}

export async function migrateFavoritesUid(
  oldUid: string,
  newUid: string
): Promise<number> {
  // One transaction, so a failure midway leaves every row under the old uid (RL-034).
  return db.transaction('rw', db.favorites, async () => {
    const favs = await db.favorites.where('uid').equals(oldUid).toArray();
    for (const fav of favs) {
      await db.favorites.delete([oldUid, fav.recipeId]);
      await db.favorites.put({ uid: newUid, recipeId: fav.recipeId, createdAt: fav.createdAt });
    }
    return favs.length;
  });
}

/** Every bookmark row on this device, for the data export (RL-056). */
export async function exportAllFavorites() {
  return db.favorites.toArray();
}
