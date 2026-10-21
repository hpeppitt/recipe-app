import { describe, it, expect } from 'vitest';
import { makeRecipe } from '../test/factories';
import type { Ingredient } from '../types/recipe';
import type { PantryItem } from './kitchen';
import {
  AISLES,
  addRecipe,
  ageingLine,
  agedItems,
  aisleFor,
  boughtItAll,
  formatLineAmount,
  groupByAisle,
  itemKey,
  listSummary,
  removeSource,
  splitByPantry,
} from './shopping';

const ing = (name: string, amount: number | null, unit: string | null): Ingredient => ({
  amount,
  unit,
  name,
  notes: null,
  group: null,
});
const recipe = (id: string, emoji: string, ingredients: Ingredient[], servings = 2) =>
  makeRecipe({ id, emoji, title: id, ingredients, servings });

describe('itemKey', () => {
  it('lowers, cuts at the comma and folds plurals', () => {
    expect(itemKey(' Butter, softened ')).toBe('butter');
    expect(itemKey('eggs')).toBe(itemKey('egg'));
    expect(itemKey('Tomatoes')).toBe(itemKey('tomato'));
    expect(itemKey('berries')).toBe('berry');
    expect(itemKey('hummus')).toBe('hummus');
  });
});

describe('aisleFor', () => {
  it('maps known words and defaults to Other', () => {
    expect(aisleFor('banana')).toBe('Produce');
    expect(aisleFor('Eggs')).toBe('Dairy');
    expect(aisleFor('egg noodles')).toBe('Pantry');
    expect(aisleFor('peanut butter')).toBe('Pantry');
    expect(aisleFor('salmon fillet')).toBe('Meat and fish');
    expect(aisleFor('xyzzy')).toBe('Other');
  });
});

describe('addRecipe and removeSource', () => {
  const a = recipe('a', '🍪', [ing('butter', 115, 'g'), ing('eggs', 2, null)]);
  const b = recipe('b', '🍰', [ing('Butter, softened', 115, 'grams'), ing('salt', null, null)]);

  it('sums butter from two recipes and keeps both emoji', () => {
    const list = addRecipe(addRecipe([], a, 2), b, 2);
    const butter = list.find((l) => l.name === 'butter')!;
    expect(butter.amount).toBe(230);
    expect(butter.sources.map((s) => s.emoji)).toEqual(['🍪', '🍰']);
    expect(formatLineAmount(butter)).toBe('230 g');
  });

  it('scales to the requested servings', () => {
    expect(addRecipe([], a, 4).find((l) => l.name === 'butter')!.amount).toBe(230);
  });

  it('keeps different units apart and shows no amount for null', () => {
    const list = addRecipe(addRecipe([], a, 2), recipe('c', 'x', [ing('butter', 2, 'tbsp')]), 2);
    expect(list.filter((l) => l.name === 'butter')).toHaveLength(2);
    const salt = addRecipe([], b, 2).find((l) => l.name === 'salt')!;
    expect(salt.amount).toBeNull();
    expect(formatLineAmount(salt)).toBe('');
  });

  it('merges a null amount into an existing line by key', () => {
    const list = addRecipe(addRecipe([], a, 2), recipe('d', 'x', [ing('butter', null, null)]), 2);
    const butter = list.filter((l) => l.name === 'butter');
    expect(butter).toHaveLength(1);
    expect(butter[0].amount).toBe(115);
    expect(butter[0].sources).toHaveLength(2);
  });

  it('removeSource subtracts and drops empty lines', () => {
    const list = removeSource(addRecipe(addRecipe([], a, 2), b, 2), 'a');
    expect(list.find((l) => l.name === 'butter')!.amount).toBe(115);
    expect(list.find((l) => l.name === 'eggs')).toBeUndefined();
    expect(removeSource(list, 'b')).toEqual([]);
  });

  it('starts a new line rather than dropping a ninth source, and removes cleanly', () => {
    let list = addRecipe([], recipe('r0', 'x', [ing('flour', 10, 'g')]), 2);
    for (let i = 1; i < 9; i++) list = addRecipe(list, recipe(`r${i}`, 'x', [ing('flour', 10, 'g')]), 2);
    const flour = list.filter((l) => l.name === 'flour');
    expect(flour.map((l) => l.sources.length)).toEqual([8, 1]);
    expect(list.flatMap((l) => l.sources)).toHaveLength(9);
    expect(removeSource(list, 'r8').filter((l) => l.name === 'flour')).toHaveLength(1);
  });

  it('caps name and title at 80', () => {
    const long = 'x'.repeat(100);
    const r = makeRecipe({
      id: 'l',
      title: ` ${long}`,
      ingredients: [ing(long, 1, null)],
    });
    const [line] = addRecipe([], r, 2);
    expect(line.name).toHaveLength(80);
    expect(line.sources[0].title).toHaveLength(80);
  });

  it('does not mutate its input', () => {
    const base = addRecipe([], a, 2);
    const copy = JSON.parse(JSON.stringify(base));
    addRecipe(base, b, 2);
    removeSource(base, 'a');
    expect(base).toEqual(copy);
  });
});

describe('pantry helpers', () => {
  const list = addRecipe(
    [],
    recipe('a', '🍪', [ing('butter', 1, null), ing('eggs', 2, null), ing('flour', 1, 'cup')]),
    2,
  );
  const pantry: PantryItem[] = [{ id: 'p', name: 'Egg', group: 'fresh', addedBy: 'u', addedAt: 1 }];

  it('splits by key and summarises', () => {
    const split = splitByPantry(list, pantry);
    expect(split.inPantry.map((l) => l.name)).toEqual(['eggs']);
    expect(split.toBuy).toHaveLength(2);
    expect(listSummary(split)).toBe('2 to buy · 1 already in the pantry');
    expect(listSummary({ toBuy: split.toBuy.slice(0, 1), inPantry: [] })).toBe('1 to buy');
    expect(listSummary({ toBuy: [], inPantry: split.inPantry })).toBe(
      'Nothing to buy · 1 already in the pantry',
    );
  });

  it('boughtItAll empties the list and skips known keys', () => {
    const out = boughtItAll(list, pantry, 5, 'u');
    expect(out.list).toEqual([]);
    expect(out.pantry.map((p) => [p.name, p.group, p.addedAt, p.addedBy])).toEqual([
      ['Egg', 'fresh', 1, 'u'],
      ['butter', 'fresh', 5, 'u'],
      ['flour', 'cupboard', 5, 'u'],
    ]);
  });

  it('groups by aisle order, alphabetical inside', () => {
    const groups = groupByAisle(
      addRecipe(
        [],
        recipe('z', 'x', [
          ing('flour', 1, null),
          ing('banana', 1, null),
          ing('apple', 1, null),
          ing('milk', 1, null),
        ]),
        2,
      ),
    );
    expect(groups.map((g) => g.aisle)).toEqual(['Produce', 'Dairy', 'Pantry']);
    expect(groups[0].lines.map((l) => l.name)).toEqual(['apple', 'banana']);
    expect(AISLES[0]).toBe('Produce');
  });
});

describe('formatLineAmount', () => {
  it('pluralises units', () => {
    expect(formatLineAmount({ amount: 2, unit: 'cup' })).toBe('2 cups');
    expect(formatLineAmount({ amount: 3, unit: null })).toBe('3');
  });
});

describe('ageing (RL-240)', () => {
  const day = 86_400_000;
  const p = (name: string, group: 'fresh' | 'cupboard', ageDays: number) => ({ id: name, name, group, addedBy: 'u', addedAt: 100 * day - ageDays * day });
  it('picks fresh items at or past the threshold', () => {
    const got = agedItems([p('a', 'fresh', 7), p('b', 'fresh', 6), p('c', 'cupboard', 30), p('d', 'fresh', 9)], 100 * day);
    expect(got.map((i) => i.name)).toEqual(['a', 'd']);
    expect(agedItems([p('b', 'fresh', 6)], 100 * day, 5)).toHaveLength(1);
  });
  it('words the line for one, two and many', () => {
    expect(ageingLine([])).toBe('');
    expect(ageingLine(['spinach'])).toBe('Been in the pantry over a week: spinach.');
    expect(ageingLine(['bananas', 'spinach'])).toBe('Been in the pantry over a week: bananas and spinach.');
    expect(ageingLine(['bananas', 'spinach', 'kale', 'milk'])).toBe('Been in the pantry over a week: bananas, spinach and 2 more.');
  });
});
