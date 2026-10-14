import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from './database';
import { migrateFavoritesUid } from './favorites';

beforeEach(async () => {
  await db.favorites.clear();
  await db.favorites.bulkPut([
    { uid: 'old', recipeId: 'a', createdAt: 100 },
    { uid: 'old', recipeId: 'b', createdAt: 200 },
    { uid: 'old', recipeId: 'c', createdAt: 300 },
    { uid: 'someone', recipeId: 'a', createdAt: 400 },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rowsOf = (uid: string) => db.favorites.where('uid').equals(uid).sortBy('recipeId');

describe('migrateFavoritesUid', () => {
  it('moves every row to the new uid with createdAt preserved', async () => {
    await expect(migrateFavoritesUid('old', 'new')).resolves.toBe(3);

    expect(await rowsOf('old')).toEqual([]);
    expect(await rowsOf('new')).toEqual([
      { uid: 'new', recipeId: 'a', createdAt: 100 },
      { uid: 'new', recipeId: 'b', createdAt: 200 },
      { uid: 'new', recipeId: 'c', createdAt: 300 },
    ]);
  });

  it("leaves other users' rows untouched", async () => {
    await migrateFavoritesUid('old', 'new');
    expect(await rowsOf('someone')).toEqual([{ uid: 'someone', recipeId: 'a', createdAt: 400 }]);
  });

  it('rolls back every row when a put throws midway', async () => {
    const put = db.favorites.put.bind(db.favorites);
    let calls = 0;
    vi.spyOn(db.favorites, 'put').mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) throw new Error('disk full');
      return put(...args);
    });

    await expect(migrateFavoritesUid('old', 'new')).rejects.toThrow('disk full');

    vi.restoreAllMocks();
    expect(await rowsOf('new')).toEqual([]);
    expect(await rowsOf('old')).toEqual([
      { uid: 'old', recipeId: 'a', createdAt: 100 },
      { uid: 'old', recipeId: 'b', createdAt: 200 },
      { uid: 'old', recipeId: 'c', createdAt: 300 },
    ]);
  });
});
