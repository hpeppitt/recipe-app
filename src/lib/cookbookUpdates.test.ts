import { describe, it, expect } from 'vitest';
import { isNewSince, sortUpdates, type CookbookUpdate } from './cookbookUpdates';

const row = (collectionId: string, lastAddedAt: number): CookbookUpdate => ({ collectionId, name: 'n', ownerUid: 'o', ownerName: null, lastAddedAt, createdAt: lastAddedAt });

describe('cookbook updates', () => {
  it('is new only when lastAddedAt is after lastSeenAt', () => {
    expect(isNewSince(200, 100)).toBe(true);
    expect(isNewSince(100, 100)).toBe(false);
    expect(isNewSince(50, 100)).toBe(false);
    expect(isNewSince(undefined, 100)).toBe(false);
    expect(isNewSince(null, null)).toBe(false);
    expect(isNewSince(5, null)).toBe(true);
  });

  it('sorts newest first without mutating', () => {
    const rows = [row('a', 1), row('b', 3), row('c', 2)];
    expect(sortUpdates(rows).map((r) => r.collectionId)).toEqual(['b', 'c', 'a']);
    expect(rows[0].collectionId).toBe('a');
  });
});
