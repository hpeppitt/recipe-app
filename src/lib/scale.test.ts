import { describe, it, expect } from 'vitest';
import { scaleIngredients, scaleRecipe, scaleFactor } from './scale';
import { makeRecipe } from '../test/factories';
import type { Ingredient } from '../types/recipe';

function ing(overrides: Partial<Ingredient>): Ingredient {
  return { amount: 1, unit: null, name: 'thing', notes: null, group: null, ...overrides };
}

describe('scaleFactor', () => {
  it('doubles from 2 to 4', () => {
    expect(scaleFactor(2, 4)).toBe(2);
  });

  it('halves from 4 to 2', () => {
    expect(scaleFactor(4, 2)).toBe(0.5);
  });

  // A stored servings of 0 would otherwise make every amount Infinity.
  it('refuses to divide by zero servings', () => {
    expect(scaleFactor(0, 4)).toBe(1);
  });
});

describe('scaleIngredients', () => {
  it('returns the same array when the factor is 1', () => {
    const items = [ing({ amount: 200, unit: 'g', name: 'flour' })];
    expect(scaleIngredients(items, 1)).toBe(items);
  });

  it('leaves a null amount alone, because "to taste" does not scale', () => {
    const [salt] = scaleIngredients([ing({ amount: null, name: 'salt', notes: 'to taste' })], 3);
    expect(salt.amount).toBeNull();
  });

  it('scales a weight and rounds to something measurable', () => {
    const [flour] = scaleIngredients([ing({ amount: 250, unit: 'g', name: 'flour' })], 1.5);
    expect(flour.amount).toBe(375);
  });

  // 237.5 g is not a thing anyone measures.
  it('rounds large amounts to the nearest 5', () => {
    const [flour] = scaleIngredients([ing({ amount: 475, unit: 'g', name: 'flour' })], 0.5);
    expect(flour.amount).toBe(240);
  });

  it('keeps quarter precision for small measured amounts', () => {
    const [vanilla] = scaleIngredients([ing({ amount: 1, unit: 'tsp', name: 'vanilla' })], 1.5);
    expect(vanilla.amount).toBe(1.5);
  });

  describe('counts, which are the ugly case', () => {
    // The roadmap named this: "0.33 egg" is the thing to avoid.
    it('never produces a fractional-third egg', () => {
      const [eggs] = scaleIngredients([ing({ amount: 1, unit: null, name: 'eggs' })], 1 / 3);
      expect(eggs.amount).toBe(0.5);
    });

    it('never scales a count to zero', () => {
      const [onion] = scaleIngredients([ing({ amount: 1, unit: null, name: 'onion' })], 0.1);
      expect(onion.amount).toBe(0.5);
    });

    it('rounds counts to halves', () => {
      const [eggs] = scaleIngredients([ing({ amount: 3, unit: null, name: 'eggs' })], 1 / 3);
      expect(eggs.amount).toBe(1);
    });

    it('doubles counts cleanly', () => {
      const [eggs] = scaleIngredients([ing({ amount: 2, unit: null, name: 'eggs' })], 2);
      expect(eggs.amount).toBe(4);
    });
  });

  describe('sub-unit amounts snap to kitchen fractions', () => {
    it('turns an awkward third into a drawable fraction', () => {
      const [soda] = scaleIngredients([ing({ amount: 1, unit: 'tsp', name: 'soda' })], 0.33);
      expect([0.25, 0.33]).toContain(soda.amount);
    });

    it('produces a half rather than 0.5000001', () => {
      const [tsp] = scaleIngredients([ing({ amount: 1.5, unit: 'tsp', name: 'salt' })], 1 / 3);
      expect(tsp.amount).toBe(0.5);
    });

    // Below an eighth, honest arithmetic beats a fraction that overstates.
    it('keeps a tiny amount as a number instead of rounding it up to a quarter', () => {
      const [yeast] = scaleIngredients([ing({ amount: 0.5, unit: 'tsp', name: 'yeast' })], 0.2);
      expect(yeast.amount).toBeLessThan(0.125);
      expect(yeast.amount).toBeGreaterThan(0);
    });
  });
});

describe('scaleRecipe', () => {
  const recipe = makeRecipe({
    servings: 4,
    prepTime: 15,
    cookTime: 45,
    totalTime: 60,
    nutrition: { calories: 500, protein: 20, carbs: 50, fat: 15 },
    ingredients: [
      ing({ amount: 400, unit: 'g', name: 'flour' }),
      ing({ amount: 2, unit: null, name: 'eggs' }),
      ing({ amount: null, name: 'salt', notes: 'to taste' }),
    ],
    instructions: [{ step: 1, text: 'Divide into 12 balls.', group: null }],
  });

  it('is identity at the recipe’s own serving count', () => {
    expect(scaleRecipe(recipe, 4)).toBe(recipe);
  });

  it('scales amounts and reports the new serving count', () => {
    const scaled = scaleRecipe(recipe, 8);
    expect(scaled.servings).toBe(8);
    expect(scaled.ingredients[0].amount).toBe(800);
    expect(scaled.ingredients[1].amount).toBe(4);
    expect(scaled.ingredients[2].amount).toBeNull();
  });

  // Doubling a traybake does not double its roasting time.
  it('does not scale times', () => {
    const scaled = scaleRecipe(recipe, 8);
    expect(scaled.prepTime).toBe(15);
    expect(scaled.cookTime).toBe(45);
    expect(scaled.totalTime).toBe(60);
  });

  // Those figures are already per serving, so they are invariant.
  it('does not scale nutrition', () => {
    expect(scaleRecipe(recipe, 8).nutrition).toEqual(recipe.nutrition);
  });

  // "Divide into 12 balls" cannot be fixed by arithmetic. Stated as a known limit.
  it('leaves instruction text untouched', () => {
    expect(scaleRecipe(recipe, 8).instructions[0].text).toBe('Divide into 12 balls.');
  });

  it('does not mutate the original', () => {
    scaleRecipe(recipe, 8);
    expect(recipe.ingredients[0].amount).toBe(400);
    expect(recipe.servings).toBe(4);
  });
});
