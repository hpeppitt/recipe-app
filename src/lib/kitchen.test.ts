import { describe, it, expect } from 'vitest';
// ?raw rather than node:fs, as in rateLimit.test.ts.
import rules from '../../firestore.rules?raw';
import { KITCHEN_ITEM_CAP, COLLECTION_RECIPE_CAP, KITCHEN_DOC_MAX_BYTES, kitchenFits } from './kitchen';

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
