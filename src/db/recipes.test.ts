import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './database';
import {
  searchRecipes,
  searchVariations,
  deleteRecipeTree,
  getCoreRecipes,
  importRecipes,
  exportAllRecipes,
} from './recipes';
import { makeRecipe, makeIngredient } from '../test/factories';

beforeEach(async () => {
  await db.recipes.clear();
});

describe('searchRecipes (dedup scoring)', () => {
  it('matches regardless of case and word order', async () => {
    await db.recipes.add(makeRecipe({ title: 'Pasta Carbonara' }));

    const results = await searchRecipes('Carbonara PASTA');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Pasta Carbonara');
  });

  it('requires at least half the query words to hit (0.5 threshold)', async () => {
    await db.recipes.add(makeRecipe({ id: 'curry', title: 'Chicken Curry' }));
    await db.recipes.add(
      makeRecipe({ id: 'tikka', title: 'Chicken Tikka Masala' })
    );

    // "chicken" alone is 1/3 hits for the curry (below threshold);
    // "chicken tikka" is 2/3 for the tikka (above threshold)
    const results = await searchRecipes('spicy chicken tikka');

    expect(results.map((r) => r.id)).toEqual(['tikka']);
  });

  it('matches against tags and ingredient names, not just the title', async () => {
    await db.recipes.add(
      makeRecipe({
        title: 'Weeknight Dinner',
        tags: ['spicy'],
        ingredients: [makeIngredient('chicken')],
      })
    );

    const results = await searchRecipes('spicy chicken');

    expect(results).toHaveLength(1);
  });

  it('ignores words of two characters or fewer and returns nothing for all-short queries', async () => {
    await db.recipes.add(makeRecipe({ title: 'Beef Stew' }));

    expect(await searchRecipes('an ox')).toEqual([]);
  });

  it('excludes recipes from the given root tree', async () => {
    await db.recipes.add(
      makeRecipe({ title: 'Tomato Soup', rootId: 'tree-a' })
    );
    await db.recipes.add(
      makeRecipe({ title: 'Tomato Soup Deluxe', rootId: 'tree-b' })
    );

    const results = await searchRecipes('tomato soup', 'tree-a');

    expect(results.map((r) => r.rootId)).toEqual(['tree-b']);
  });

  it('caps results at five', async () => {
    for (let i = 0; i < 7; i++) {
      await db.recipes.add(makeRecipe({ title: `Tomato Soup ${i}` }));
    }

    const results = await searchRecipes('tomato soup');

    expect(results).toHaveLength(5);
  });
});

describe('searchVariations', () => {
  it('searches only within the given tree and excludes the given id', async () => {
    await db.recipes.add(
      makeRecipe({ id: 'root', rootId: 'root', title: 'Chili Base' })
    );
    await db.recipes.add(
      makeRecipe({
        id: 'var-1',
        rootId: 'root',
        parentId: 'root',
        title: 'Extra Spicy Chili',
      })
    );
    await db.recipes.add(
      makeRecipe({ id: 'other', title: 'Spicy Chili Outside Tree' })
    );

    const results = await searchVariations('root', 'spicy chili', 'root');

    expect(results.map((r) => r.id)).toEqual(['var-1']);
  });

  it('matches against the stored prompt text', async () => {
    await db.recipes.add(
      makeRecipe({
        id: 'var-1',
        rootId: 'root',
        parentId: 'root',
        title: 'Chili v2',
        prompt: 'make it vegetarian with beans',
      })
    );

    const results = await searchVariations('root', 'vegetarian beans');

    expect(results.map((r) => r.id)).toEqual(['var-1']);
  });
});

describe('deleteRecipeTree', () => {
  async function seedTree() {
    await db.recipes.add(makeRecipe({ id: 'r1', rootId: 'r1' }));
    await db.recipes.add(
      makeRecipe({ id: 'r2', rootId: 'r1', parentId: 'r1', depth: 1 })
    );
    await db.recipes.add(
      makeRecipe({ id: 'r3', rootId: 'r1', parentId: 'r2', depth: 2 })
    );
    await db.recipes.add(
      makeRecipe({ id: 'r4', rootId: 'r1', parentId: 'r1', depth: 1 })
    );
  }

  it('deletes a node and all its descendants, keeping the rest of the tree', async () => {
    await seedTree();

    await deleteRecipeTree('r2');

    const remaining = (await db.recipes.toArray()).map((r) => r.id).sort();
    expect(remaining).toEqual(['r1', 'r4']);
  });

  it('deletes the whole tree when given the root', async () => {
    await seedTree();

    await deleteRecipeTree('r1');

    expect(await db.recipes.count()).toBe(0);
  });

  it('returns the ids it deleted so the cloud cascade can reuse them', async () => {
    await seedTree();

    const deleted = await deleteRecipeTree('r2');

    expect(deleted.sort()).toEqual(['r2', 'r3']);
  });

  it('returns an empty list when the recipe does not exist', async () => {
    expect(await deleteRecipeTree('nope')).toEqual([]);
  });
});

describe('importRecipes', () => {
  it('adds new recipes and reports the count', async () => {
    const result = await importRecipes([makeRecipe({ id: 'i1' }), makeRecipe({ id: 'i2' })]);

    expect(result).toMatchObject({ added: 2, replaced: 0, skipped: 0 });
    expect(await db.recipes.count()).toBe(2);
  });

  // AUDIT.md claimed a re-import "duplicates every recipe under new UUIDs".
  // bulkPut is keyed on the inbound id, so it is actually an upsert.
  it('is idempotent when the same export is imported twice', async () => {
    const file = [makeRecipe({ id: 'same-1' }), makeRecipe({ id: 'same-2' })];

    await importRecipes(file);
    const second = await importRecipes(file);

    expect(second).toMatchObject({ added: 0, replaced: 2 });
    expect(await db.recipes.count()).toBe(2);
  });

  it('round-trips an export without loss or duplication', async () => {
    await db.recipes.add(makeRecipe({ id: 'orig', title: 'Round Trip' }));

    const exported = await exportAllRecipes();
    const result = await importRecipes(JSON.parse(JSON.stringify(exported)));

    expect(result).toMatchObject({ added: 0, replaced: 1, skipped: 0 });
    expect(await db.recipes.count()).toBe(1);
    expect((await db.recipes.get('orig'))?.title).toBe('Round Trip');
  });

  it('persists nothing when every record is malformed', async () => {
    const result = await importRecipes([{ nope: true }, 'garbage']);

    expect(result).toMatchObject({ added: 0, replaced: 0, skipped: 2 });
    expect(await db.recipes.count()).toBe(0);
  });

  it('leaves the store queryable after importing a mixed file', async () => {
    await importRecipes([
      makeRecipe({ id: 'ok', title: 'Tomato Soup', tags: ['warm'] }),
      { ...makeRecipe({ id: 'bad' }), ingredients: undefined },
    ]);

    // The whole point: a bad record used to land in the store and throw here.
    await expect(searchRecipes('tomato soup')).resolves.toHaveLength(1);
  });

  it('tolerates a non-array file without throwing', async () => {
    await expect(importRecipes({ recipes: [] })).resolves.toMatchObject({ added: 0, skipped: 0 });
  });
});

describe('getCoreRecipes', () => {
  it('returns only roots with a count of their descendants', async () => {
    await db.recipes.add(makeRecipe({ id: 'r1', rootId: 'r1' }));
    await db.recipes.add(
      makeRecipe({ id: 'r2', rootId: 'r1', parentId: 'r1', depth: 1 })
    );
    await db.recipes.add(
      makeRecipe({ id: 'r3', rootId: 'r1', parentId: 'r2', depth: 2 })
    );
    await db.recipes.add(makeRecipe({ id: 'solo', rootId: 'solo' }));

    const cores = await getCoreRecipes();
    const byId = new Map(cores.map((c) => [c.id, c.childCount]));

    expect(byId.size).toBe(2);
    expect(byId.get('r1')).toBe(2);
    expect(byId.get('solo')).toBe(0);
  });
});
