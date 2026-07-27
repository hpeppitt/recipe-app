import { describe, it, expect } from 'vitest';
import { mergeDedupById, queryWords, rankByQuery, recipeHaystack } from './search';

describe('queryWords', () => {
  it('lowercases and drops words of two characters or fewer', () => {
    expect(queryWords('Spicy AN ox Chicken')).toEqual(['spicy', 'chicken']);
  });

  it('returns nothing when every word is too short', () => {
    expect(queryWords('an ox is')).toEqual([]);
  });
});

describe('recipeHaystack', () => {
  it('includes title, description, tags and ingredient names', () => {
    const haystack = recipeHaystack({
      title: 'Weeknight Dinner',
      description: 'quick and easy',
      tags: ['spicy'],
      ingredients: [{ name: 'chicken' }],
    });

    expect(haystack).toContain('Weeknight Dinner');
    expect(haystack).toContain('quick and easy');
    expect(haystack).toContain('spicy');
    expect(haystack).toContain('chicken');
  });

  it('tolerates published docs with missing tags or ingredients', () => {
    const haystack = recipeHaystack({
      title: 'Bare Recipe',
      description: 'no arrays',
    } as Parameters<typeof recipeHaystack>[0]);

    expect(haystack).toContain('Bare Recipe');
  });
});

describe('mergeDedupById', () => {
  it('keeps the local entry when the same recipe is also published', () => {
    const local = [{ id: 'a', local: true }];
    const cloud = [{ id: 'a', local: false }];

    expect(mergeDedupById(local, cloud, { limit: 5 })).toEqual([{ id: 'a', local: true }]);
  });

  it('appends cloud-only matches after local ones', () => {
    const local = [{ id: 'a' }];
    const cloud = [{ id: 'b' }, { id: 'c' }];

    expect(mergeDedupById(local, cloud, { limit: 5 }).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('surfaces cloud matches when the user has no local matches at all', () => {
    // This is the FUN-1 case: nothing local, but the shared library already has it.
    expect(mergeDedupById([], [{ id: 'b' }], { limit: 5 }).map((r) => r.id)).toEqual(['b']);
  });

  it('caps the merged list at the limit', () => {
    const cloud = [{ id: 'b' }, { id: 'c' }, { id: 'd' }];

    expect(
      mergeDedupById([{ id: 'a' }], cloud, { limit: 2, maxFromSecondary: 1 }).map((r) => r.id)
    ).toEqual(['a', 'b']);
  });

  it('reserves slots for cloud matches instead of letting local results bury them', () => {
    // Without a reservation, five local matches would fill the limit and the
    // cloud duplicate FUN-1 exists to surface would never be shown.
    const local = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }, { id: 'l5' }];
    const cloud = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

    const merged = mergeDedupById(local, cloud, { limit: 5, maxFromSecondary: 2 });

    expect(merged.map((r) => r.id)).toEqual(['l1', 'l2', 'l3', 'c1', 'c2']);
  });

  it('gives local results the reserved cloud slots when there are no cloud matches', () => {
    const local = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }, { id: 'l5' }];

    const merged = mergeDedupById(local, [], { limit: 5, maxFromSecondary: 2 });

    expect(merged.map((r) => r.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });
});

describe('rankByQuery', () => {
  const haystack = (s: string) => s;

  it('returns nothing for an all-short query without scoring anything', () => {
    expect(
      rankByQuery(['beef stew'], 'an ox', { haystack, threshold: 0.5, limit: 5 })
    ).toEqual([]);
  });

  it('keeps only items at or above the threshold', () => {
    const items = ['chicken tikka masala', 'chicken curry'];

    // "chicken tikka" hits 2/3 for the first, 1/3 for the second
    expect(
      rankByQuery(items, 'spicy chicken tikka', { haystack, threshold: 0.5, limit: 5 })
    ).toEqual(['chicken tikka masala']);
  });

  it('sorts by descending score', () => {
    const items = ['tomato', 'tomato basil soup'];

    expect(
      rankByQuery(items, 'tomato basil soup', { haystack, threshold: 0.3, limit: 5 })
    ).toEqual(['tomato basil soup', 'tomato']);
  });

  it('caps results at the given limit', () => {
    const items = ['tomato soup a', 'tomato soup b', 'tomato soup c'];

    expect(
      rankByQuery(items, 'tomato soup', { haystack, threshold: 0.5, limit: 2 })
    ).toHaveLength(2);
  });

  it('matches on substrings, which is why "rice" hits "licorice"', () => {
    // Documents a known false-positive rather than asserting it is desirable.
    expect(
      rankByQuery(['licorice twists'], 'rice', { haystack, threshold: 0.5, limit: 5 })
    ).toEqual(['licorice twists']);
  });
});
