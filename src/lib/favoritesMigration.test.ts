import { describe, it, expect } from 'vitest';
import { selectFavoritesToPush } from './favoritesMigration';

const fav = (uid: string, recipeId: string, createdAt = 1) => ({ uid, recipeId, createdAt });

describe('selectFavoritesToPush', () => {
  it('returns nothing for no rows', () => {
    expect(selectFavoritesToPush([], 'me')).toEqual([]);
  });

  it('keeps only rows for the given uid', () => {
    expect(selectFavoritesToPush([fav('me', 'a'), fav('other', 'b')], 'me')).toEqual([
      fav('me', 'a'),
    ]);
  });

  it('drops rows with no recipe id', () => {
    expect(selectFavoritesToPush([fav('me', ''), fav('me', 'a')], 'me')).toEqual([fav('me', 'a')]);
  });

  it('deduplicates by recipe id, keeping the earliest createdAt', () => {
    const out = selectFavoritesToPush([fav('me', 'a', 5), fav('me', 'b', 2), fav('me', 'a', 3)], 'me');
    expect(out).toEqual([fav('me', 'a', 3), fav('me', 'b', 2)]);
  });
});
