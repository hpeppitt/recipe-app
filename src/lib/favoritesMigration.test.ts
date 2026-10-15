import { describe, it, expect } from 'vitest';
import { selectFavoritesToPush, selectFavoritesToHydrate } from './favoritesMigration';

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

describe('selectFavoritesToHydrate', () => {
  it('returns nothing for no cloud rows', () => {
    expect(selectFavoritesToHydrate([], [fav('me', 'a')], 'me')).toEqual([]);
  });

  it('adds every cloud row when nothing is local, keeping the cloud createdAt', () => {
    expect(selectFavoritesToHydrate([fav('me', 'a', 7), fav('me', 'b', 3)], [], 'me')).toEqual([
      fav('me', 'a', 7),
      fav('me', 'b', 3),
    ]);
  });

  it('skips recipes already favourited locally', () => {
    expect(selectFavoritesToHydrate([fav('me', 'a', 7), fav('me', 'b', 3)], [fav('me', 'a', 99)], 'me')).toEqual([
      fav('me', 'b', 3),
    ]);
  });

  it("does not treat another uid's local row as a local favourite", () => {
    expect(selectFavoritesToHydrate([fav('me', 'a')], [fav('other', 'a')], 'me')).toEqual([fav('me', 'a')]);
  });

  it('drops cloud rows for another uid', () => {
    expect(selectFavoritesToHydrate([fav('other', 'a'), fav('me', 'b')], [], 'me')).toEqual([fav('me', 'b')]);
  });

  it('drops cloud rows with a missing or non-string recipe id', () => {
    const rows = [{ uid: 'me', createdAt: 1 }, fav('me', ''), { uid: 'me', recipeId: 42, createdAt: 1 }, fav('me', 'a')];
    expect(selectFavoritesToHydrate(rows, [], 'me')).toEqual([fav('me', 'a')]);
  });

  it('drops cloud rows whose createdAt is not a finite number', () => {
    const rows = [{ uid: 'me', recipeId: 'a' }, { uid: 'me', recipeId: 'b', createdAt: '5' }, { uid: 'me', recipeId: 'c', createdAt: NaN }, fav('me', 'd', 4)];
    expect(selectFavoritesToHydrate(rows, [], 'me')).toEqual([fav('me', 'd', 4)]);
  });

  it('skips recipes removed on this device this session', () => {
    expect(selectFavoritesToHydrate([fav('me', 'a'), fav('me', 'b')], [], 'me', new Set(['a']))).toEqual([
      fav('me', 'b'),
    ]);
  });

  it('deduplicates by recipe id, keeping the earliest createdAt, sorted by recipe id', () => {
    const out = selectFavoritesToHydrate([fav('me', 'c', 5), fav('me', 'a', 9), fav('me', 'c', 2)], [], 'me');
    expect(out).toEqual([fav('me', 'a', 9), fav('me', 'c', 2)]);
  });

  it('copies only uid, recipeId and createdAt', () => {
    const out = selectFavoritesToHydrate([{ ...fav('me', 'a'), recipeOwnerId: 'x' } as never], [], 'me');
    expect(out).toEqual([fav('me', 'a')]);
  });
});
