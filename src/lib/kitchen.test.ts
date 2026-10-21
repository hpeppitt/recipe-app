import { describe, it, expect } from 'vitest';
// ?raw rather than node:fs, as in rateLimit.test.ts.
import rules from '../../firestore.rules?raw';
import { KITCHEN_ITEM_CAP, KITCHEN_MEMBER_CAP, KITCHEN_INVITE_DAYS, KITCHEN_INVITE_CODE_MIN, COLLECTION_RECIPE_CAP, KITCHEN_DOC_MAX_BYTES, kitchenFits, COLLECTION_NAME_MAX, COLLECTION_RECIPE_ID_MAX, CollectionRefusedError, collectionName, checkCollectionRecipeId, checkCollectionRoom, checkCollectionCount, COLLECTIONS_PER_USER_MAX, newInviteCode, isInviteCode, inviteUrl, pickKitchenId, sharedWithLine } from './kitchen';

describe('firestore.rules kitchen and collection caps (RL-211)', () => {
  // Fails, rather than passing vacuously, when a function is renamed or removed.
  const literal = (fn: string) => {
    const m = new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return (\\d+);`).exec(rules);
    return m ? Number(m[1]) : undefined;
  };

  it('match the client constants', () => {
    expect(literal('kitchenItemCap')).toBe(KITCHEN_ITEM_CAP);
    expect(literal('collectionRecipeCap')).toBe(COLLECTION_RECIPE_CAP);
  });

  it('apply each cap to its lists', () => {
    expect(rules).toContain('d.shopping.size() <= kitchenItemCap()');
    expect(rules).toContain('d.pantry.size() <= kitchenItemCap()');
    expect(rules).toContain('d.recipeIds.size() <= collectionRecipeCap()');
  });

  it('match the household sharing limits (RL-237)', () => {
    expect(literal('kitchenMemberCap')).toBe(KITCHEN_MEMBER_CAP);
    expect(literal('kitchenInviteDays')).toBe(KITCHEN_INVITE_DAYS);
    expect(literal('kitchenInviteCodeMin')).toBe(KITCHEN_INVITE_CODE_MIN);
    expect(rules).toContain('request.resource.data.memberUids.size() <= kitchenMemberCap()');
    expect(rules).toContain("d.expiresAt <= request.time + duration.value(kitchenInviteDays(), 'd')");
    expect(rules).toContain('code.size() >= kitchenInviteCodeMin()');
    // The charset regex carries the minimum as a literal.
    expect(rules).toContain(`code.matches('^[A-Za-z0-9_-]{${KITCHEN_INVITE_CODE_MIN},64}$')`);
  });
});

describe('kitchenFits (RL-213)', () => {
  const pantry = (n: number, name = 'salt') =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name, group: 'cupboard' as const, addedBy: 'u', addedAt: 1 }));

  it('allows exactly the cap and refuses one more', () => {
    expect(kitchenFits({ shopping: [], pantry: pantry(KITCHEN_ITEM_CAP) })).toBe(true);
    expect(kitchenFits({ shopping: [], pantry: pantry(KITCHEN_ITEM_CAP + 1) })).toBe(false);
  });

  it('refuses lists under the cap whose serialized size passes the guard', () => {
    expect(kitchenFits({ shopping: [], pantry: pantry(KITCHEN_ITEM_CAP, 'x'.repeat(KITCHEN_DOC_MAX_BYTES / KITCHEN_ITEM_CAP)) })).toBe(false);
  });

  it('never refuses a change that does not grow the lists', () => {
    const over = { shopping: [], pantry: pantry(KITCHEN_ITEM_CAP + 2) };
    expect(kitchenFits({ shopping: [], pantry: pantry(KITCHEN_ITEM_CAP + 1) }, over)).toBe(true);
    expect(kitchenFits({ shopping: [], pantry: pantry(KITCHEN_ITEM_CAP + 3) }, over)).toBe(false);
  });
});

describe('collection validation (RL-222)', () => {
  it('trims names and refuses empty or over 60 characters', () => {
    expect(collectionName('  Weeknights  ')).toBe('Weeknights');
    expect(collectionName('x'.repeat(COLLECTION_NAME_MAX))).toHaveLength(COLLECTION_NAME_MAX);
    expect(() => collectionName('   ')).toThrow('Give it a name.');
    expect(() => collectionName('x'.repeat(COLLECTION_NAME_MAX + 1))).toThrow('Keep it under 60 characters.');
    expect(() => collectionName('')).toThrow(CollectionRefusedError);
  });

  it('accepts recipe ids up to 36 characters only', () => {
    expect(() => checkCollectionRecipeId('x'.repeat(COLLECTION_RECIPE_ID_MAX))).not.toThrow();
    expect(() => checkCollectionRecipeId('x'.repeat(COLLECTION_RECIPE_ID_MAX + 1))).toThrow(CollectionRefusedError);
    expect(() => checkCollectionRecipeId('')).toThrow(CollectionRefusedError);
  });

  it('has room below the cap and none at it', () => {
    expect(() => checkCollectionRoom(Array(COLLECTION_RECIPE_CAP - 1).fill('r'))).not.toThrow();
    expect(() => checkCollectionRoom(Array(COLLECTION_RECIPE_CAP).fill('r'))).toThrow('This collection is full.');
  });

  it('match the rules name bound', () => {
    expect(rules).toContain(`d.name.size() <= ${COLLECTION_NAME_MAX}`);
  });
});

describe('checkCollectionCount (RL-222 review)', () => {
  it('allows the 100th collection and refuses the 101st', () => {
    expect(() => checkCollectionCount(COLLECTIONS_PER_USER_MAX - 1)).not.toThrow();
    expect(() => checkCollectionCount(COLLECTIONS_PER_USER_MAX)).toThrow('You have 100 collections. Delete one first.');
  });
});

describe('household sharing helpers (RL-238)', () => {
  it('makes a 20-character URL-safe code the rules accept, from the random bytes given', () => {
    const code = newInviteCode();
    expect(code).toHaveLength(KITCHEN_INVITE_CODE_MIN);
    expect(isInviteCode(code)).toBe(true);
    expect(newInviteCode()).not.toBe(code);
    expect(newInviteCode((b) => b.fill(255))).toBe('_'.repeat(20));
    expect(newInviteCode((b) => b.fill(64))).toBe('A'.repeat(20));
  });

  it('accepts only 20 to 64 URL-safe characters, so never a colon or a path', () => {
    expect(isInviteCode('a'.repeat(19))).toBe(false);
    expect(isInviteCode('a'.repeat(65))).toBe(false);
    expect(isInviteCode(`${'a'.repeat(20)}:x`)).toBe(false);
    expect(isInviteCode(`${'a'.repeat(20)}/x`)).toBe(false);
    expect(isInviteCode('aZ0_-'.repeat(4))).toBe(true);
  });

  it('builds the join link', () => {
    expect(inviteUrl('https://example.test', 'abc')).toBe('https://example.test/join/abc');
  });

  it('prefers a kitchen other than the own one, else the own id', () => {
    expect(pickKitchenId('me', [])).toBe('me');
    expect(pickKitchenId('me', ['me'])).toBe('me');
    expect(pickKitchenId('me', ['me', 'them'])).toBe('them');
    expect(pickKitchenId('me', ['them', 'me'])).toBe('them');
  });
});

describe('sharedWithLine (RL-239)', () => {
  it('names the others, or says Just you', () => {
    expect(sharedWithLine([])).toBe('Just you');
    expect(sharedWithLine(['Ola'])).toBe('Shared with Ola');
    expect(sharedWithLine(['Ola', 'Sami'])).toBe('Shared with Ola and Sami');
    expect(sharedWithLine(['Ola', 'Sami', 'Kim'])).toBe('Shared with Ola, Sami and Kim');
    expect(sharedWithLine([null, ' '])).toBe('Shared with a cook and a cook');
  });
});
