import { describe, it, expect } from 'vitest';
// ?raw rather than node:fs, as in rateLimit.test.ts.
import rules from '../../firestore.rules?raw';
import { KITCHEN_ITEM_CAP, COLLECTION_RECIPE_CAP } from './kitchen';

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
