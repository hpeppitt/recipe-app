import { describe, expect, it } from 'vitest';
import { makeIngredient, makeRecipe } from '../test/factories';
import type { Ingredient, Instruction } from '../types/recipe';
import { diffRecipes, summariseChanges } from './recipeDiff';

const ing = (name: string, over: Partial<Ingredient> = {}): Ingredient => ({
  ...makeIngredient(name),
  ...over,
});
const steps = (...texts: string[]): Instruction[] =>
  texts.map((text, i) => ({ step: i + 1, text, group: null }));
const types = (d: ReturnType<typeof diffRecipes>) => d.ingredients.map((c) => c.type);

describe('diffRecipes ingredients', () => {
  it('reports identical recipes as identical', () => {
    const r = makeRecipe({ ingredients: [ing('flour')], instructions: steps('Mix.') });
    const d = diffRecipes(r, makeRecipe({ ingredients: [ing('flour')], instructions: steps('Mix.') }));
    expect(d.identical).toBe(true);
    expect(summariseChanges(d, 4)).toEqual([]);
  });

  it('never throws on empty arrays', () => {
    const d = diffRecipes(makeRecipe(), makeRecipe());
    expect(d.identical).toBe(true);
    expect(d.ingredients).toEqual([]);
    expect(d.steps).toEqual([]);
    expect(() => diffRecipes(makeRecipe(), makeRecipe({ ingredients: [ing('a')], instructions: steps('x') }))).not.toThrow();
  });

  it('treats an amount edit as exactly one changed entry', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('banana', { amount: 2 })] }),
      makeRecipe({ ingredients: [ing('banana', { amount: 3 })] }),
    );
    expect(types(d)).toEqual(['changed']);
    expect(d.identical).toBe(false);
  });

  it('reports added and removed ingredients', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('raisins')] }),
      makeRecipe({ ingredients: [ing('walnuts')] }),
    );
    expect(types(d).sort()).toEqual(['added', 'removed']);
  });

  it('pairs similar names as changed', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('butter')] }),
      makeRecipe({ ingredients: [ing('unsalted butter')] }),
    );
    expect(types(d)).toEqual(['changed']);
  });

  it('matches plural and singular names', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('bananas')] }),
      makeRecipe({ ingredients: [ing('banana')] }),
    );
    expect(types(d)).toEqual(['unchanged']);
  });

  it('treats a unit change as changed', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('milk', { amount: 1, unit: 'cup' })] }),
      makeRecipe({ ingredients: [ing('milk', { amount: 240, unit: 'ml' })] }),
    );
    expect(types(d)).toEqual(['changed']);
  });

  it('treats g and grams with the same amount as unchanged', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('sugar', { amount: 50, unit: 'g' })] }),
      makeRecipe({ ingredients: [ing('sugar', { amount: 50, unit: 'grams' })] }),
    );
    expect(types(d)).toEqual(['unchanged']);
  });

  it('compares by unit and name when an amount is null', () => {
    const one = (amount: number | null, unit: string | null = 'g') => makeRecipe({ ingredients: [ing('salt', { amount, unit })] });
    expect(types(diffRecipes(one(null), one(5)))).toEqual(['unchanged']);
    expect(types(diffRecipes(one(null), one(null)))).toEqual(['unchanged']);
    expect(types(diffRecipes(one(null), one(null, 'tsp')))).toEqual(['changed']);
  });

  it('pairs the same name within its group first', () => {
    const d = diffRecipes(
      makeRecipe({ ingredients: [ing('sugar', { group: 'Cake', amount: 100 }), ing('sugar', { group: 'Icing', amount: 50 })] }),
      makeRecipe({ ingredients: [ing('sugar', { group: 'Icing', amount: 50 }), ing('sugar', { group: 'Cake', amount: 100 })] }),
    );
    expect(types(d)).toEqual(['unchanged', 'unchanged']);
  });
});

describe('diffRecipes method', () => {
  it('reports one added step when a step is inserted mid-method', () => {
    const d = diffRecipes(
      makeRecipe({ instructions: steps('Mix.', 'Bake.', 'Cool.') }),
      makeRecipe({ instructions: steps('Mix.', 'Fold in nuts.', 'Bake.', 'Cool.') }),
    );
    expect(d.steps.map((s) => s.type)).toEqual(['unchanged', 'added', 'unchanged', 'unchanged']);
  });

  it('gives a reworded step insert and delete spans', () => {
    const d = diffRecipes(
      makeRecipe({ instructions: steps('Bake for 20 minutes.') }),
      makeRecipe({ instructions: steps('Bake for 30 minutes.') }),
    );
    const s = d.steps[0];
    expect(s.type).toBe('changed');
    if (s.type !== 'changed') return;
    expect(s.spans).toEqual([
      { type: 'same', text: 'Bake for' },
      { type: 'delete', text: '20' },
      { type: 'insert', text: '30' },
      { type: 'same', text: 'minutes.' },
    ]);
  });

  it('reports removed steps', () => {
    const d = diffRecipes(makeRecipe({ instructions: steps('Mix.', 'Bake.') }), makeRecipe({ instructions: steps('Mix.') }));
    expect(d.steps.map((s) => s.type)).toEqual(['unchanged', 'removed']);
  });
});

describe('diffRecipes time and servings', () => {
  it('computes deltas', () => {
    const d = diffRecipes(makeRecipe({ totalTime: 30, servings: 2 }), makeRecipe({ totalTime: 45, servings: 2 }));
    expect(d.totalTime).toEqual({ before: 30, after: 45, delta: 15 });
    expect(d.servings.delta).toBe(0);
    expect(d.identical).toBe(false);
  });
});

describe('summariseChanges', () => {
  const sum = (a: Ingredient[], b: Ingredient[], max = 10) =>
    summariseChanges(diffRecipes(makeRecipe({ ingredients: a }), makeRecipe({ ingredients: b })), max);

  it('formats deltas, adds, removes and other changes', () => {
    expect(sum([ing('banana', { amount: 2 })], [ing('banana', { amount: 3 })])).toEqual(['+1 banana']);
    expect(sum([ing('sugar', { amount: 100, unit: 'g' })], [ing('sugar', { amount: 50, unit: 'g' })])).toEqual(['-50 g sugar']);
    expect(sum([], [ing('walnuts', { amount: 80, unit: 'g' })])).toEqual(['+ 80 g walnuts']);
    expect(sum([], [ing('purée swirl', { amount: null })])).toEqual(['+ purée swirl']);
    expect(sum([ing('raisins')], [])).toEqual(['- raisins']);
    expect(sum([ing('butter', { amount: 1, unit: 'cup' })], [ing('butter', { amount: 240, unit: 'ml' })])).toEqual(['~ butter']);
  });

  it('orders added, changed, removed', () => {
    const tags = sum(
      [ing('raisins'), ing('banana', { amount: 1 })],
      [ing('walnuts', { amount: null }), ing('banana', { amount: 2 })],
    );
    expect(tags).toEqual(['+ walnuts', '+1 banana', '- raisins']);
  });

  it('says ~ method only when there are no ingredient tags', () => {
    const d = diffRecipes(makeRecipe({ instructions: steps('Mix.') }), makeRecipe({ instructions: steps('Stir.') }));
    expect(summariseChanges(d, 3)).toEqual(['~ method']);
  });

  it('truncates with +N more within max, and max 0 is empty', () => {
    const a = [ing('a'), ing('b'), ing('c'), ing('d')].map((i) => ({ ...i, amount: null }));
    const tags = sum([], a, 3);
    expect(tags).toEqual(['+ a', '+ b', '+2 more']);
    expect(sum([], a, 1)).toEqual(['+4 more']);
    expect(sum([], a, 0)).toEqual([]);
  });
});
