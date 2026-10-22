import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FamilyMoveTimeoutError } from '../lib/errors';
import { db } from './database';
import {
  searchRecipes,
  searchVariations,
  deleteRecipeTree,
  getSubtreeIds,
  importRecipes,
  exportAllRecipes,
  clearAllRecipes,
  buildRecipe,
  createRecipe,
  applyOwnRecipeSync,
  clearOwnRecipes,
  reparentChildren,
  moveFamilyCloudFirst,
  getRecipe,
  getAllRecipes,
  getRecipeTree,
} from './recipes';
import { makeRecipe, makeIngredient } from '../test/factories';
import type { Recipe } from '../types/recipe';

beforeEach(async () => {
  await db.recipes.clear();
  await db.favorites.clear();
});

describe('buildRecipe and createRecipe', () => {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...generated } =
    makeRecipe({ title: 'Soup' });
  const owner = { uid: 'me', displayName: 'Me' };

  it('buildRecipe returns a root record without writing it', async () => {
    const r = buildRecipe(generated, 'soup', [], null, null, -1, owner);

    expect(r).toMatchObject({ title: 'Soup', prompt: 'soup', parentId: null, depth: 0, createdBy: owner });
    expect(r.rootId).toBe(r.id);
    expect(await db.recipes.count()).toBe(0);
  });

  it('buildRecipe places a variation under its parent and mints a new id each call', () => {
    const a = buildRecipe(generated, 'p', [], 'parent', 'root', 1, owner);
    const b = buildRecipe(generated, 'p', [], 'parent', 'root', 1, owner);

    expect(a).toMatchObject({ parentId: 'parent', rootId: 'root', depth: 2 });
    expect(b.id).not.toBe(a.id);
  });

  it('createRecipe builds and adds the row', async () => {
    const r = await createRecipe(generated, 'soup', []);

    expect(await db.recipes.get(r.id)).toEqual(r);
    expect(r.createdBy.uid).toBe('local');
  });
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

describe('reparentChildren', () => {
  it('moves the children up a level so deleteRecipeTree then removes only the old parent', async () => {
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'r1', rootId: 'r1' }),
      makeRecipe({ id: 'v', rootId: 'r1', parentId: 'r1', depth: 1 }),
      makeRecipe({ id: 'w', rootId: 'r1', parentId: 'v', depth: 2, title: 'Kept' }),
      makeRecipe({ id: 'g', rootId: 'r1', parentId: 'w', depth: 3 }),
    ]);

    await reparentChildren(['w', 'not-here'], 'r1');
    expect(await deleteRecipeTree('v')).toEqual(['v']);

    const w = await db.recipes.get('w');
    expect(w).toMatchObject({ parentId: 'r1', depth: 1, title: 'Kept' });
    expect(await db.recipes.get('g')).toMatchObject({ parentId: 'w', depth: 3 });
    expect(await db.recipes.count()).toBe(3);
  });
});

describe('moveFamilyCloudFirst', () => {
  const seed = () =>
    db.recipes.bulkAdd([
      makeRecipe({ id: 'n', rootId: 'n', relatedFamilyId: 't', title: 'Mine' }),
      makeRecipe({ id: 'a', rootId: 'n', parentId: 'n', depth: 1 }),
      // Only on this device: never published.
      makeRecipe({ id: 'local', rootId: 'n', parentId: 'a', depth: 2 }),
    ]);
  const changes = [
    { id: 'n', parentId: 't', rootId: 't', depth: 1 },
    { id: 'a', parentId: 'n', rootId: 't', depth: 2 },
    { id: 'not-here', parentId: 'n', rootId: 't', depth: 2 },
  ];

  it('mirrors the committed changes here, local-only rows too, and clears the link', async () => {
    await seed();
    const result = await moveFamilyCloudFirst('n', Promise.resolve({ changes, leftBehind: 0 }));
    expect(result.mirrored).toBe(true);
    expect(await db.recipes.get('n')).toMatchObject({ parentId: 't', rootId: 't', depth: 1, relatedFamilyId: null, title: 'Mine' });
    expect(await db.recipes.get('a')).toMatchObject({ parentId: 'n', rootId: 't', depth: 2 });
    expect(await db.recipes.get('local')).toMatchObject({ parentId: 'a', rootId: 't', depth: 3 });
    expect(await db.recipes.count()).toBe(3);
  });

  it('leaves Dexie untouched when the cloud move fails or times out', async () => {
    await seed();
    const before = await db.recipes.toArray();
    await expect(moveFamilyCloudFirst('n', Promise.reject(new Error('permission-denied')))).rejects.toThrow('permission-denied');
    await expect(moveFamilyCloudFirst('n', new Promise(() => {}), 10)).rejects.toBeInstanceOf(FamilyMoveTimeoutError);
    expect(await db.recipes.toArray()).toEqual(before);
  });

  it('still resolves when the mirror fails after the commit', async () => {
    await seed();
    const spy = vi.spyOn(db.recipes, 'put').mockRejectedValueOnce(new Error('quota'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    const result = await moveFamilyCloudFirst('n', Promise.resolve({ changes, leftBehind: 1 }));
    expect(result).toMatchObject({ mirrored: false, leftBehind: 1 });
    spy.mockRestore();
  });
});

describe('getSubtreeIds', () => {
  it('returns the root, child and grandchild ids without deleting anything', async () => {
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'r1', rootId: 'r1' }),
      makeRecipe({ id: 'r2', rootId: 'r1', parentId: 'r1', depth: 1 }),
      makeRecipe({ id: 'r3', rootId: 'r1', parentId: 'r2', depth: 2 }),
      makeRecipe({ id: 'x1', rootId: 'x1' }),
    ]);

    expect((await getSubtreeIds('r1')).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(await db.recipes.count()).toBe(4);
    expect((await deleteRecipeTree('r1')).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('returns an empty list when the recipe does not exist', async () => {
    expect(await getSubtreeIds('nope')).toEqual([]);
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

  it("leaves the user's own rows alone, counts them, and stamps the rest 'local'", async () => {
    const me = { uid: 'me', displayName: 'Me' };
    await db.recipes.add(makeRecipe({ id: 'kept', title: 'Cloud copy', createdBy: me }));

    const result = await importRecipes(
      [
        makeRecipe({ id: 'kept', title: 'Old export', createdBy: me }),
        makeRecipe({ id: 'deleted', createdBy: me }),
        makeRecipe({ id: 'pre-wipe', createdBy: { uid: 'old-me', displayName: 'Me' } }),
      ],
      { uid: 'me', previousUids: ['old-me'] }
    );

    expect(result).toMatchObject({ added: 2, replaced: 0, alreadyInAccount: 1 });
    expect(await db.recipes.get('kept')).toMatchObject({ title: 'Cloud copy', createdBy: me });
    expect((await db.recipes.get('deleted'))?.createdBy).toEqual({ uid: 'local', displayName: 'Me' });
    expect((await db.recipes.get('pre-wipe'))?.createdBy.uid).toBe('local');
  });

  it('overwrites a Saved row with the same id when signed out', async () => {
    await db.recipes.add(makeRecipe({ id: 's', title: 'Before' }));

    const result = await importRecipes([makeRecipe({ id: 's', title: 'After' })]);

    expect(result).toMatchObject({ added: 0, replaced: 1, alreadyInAccount: 0 });
    expect((await db.recipes.get('s'))?.title).toBe('After');
  });
});

describe('clearAllRecipes', () => {
  it('clears favourites too, not just recipes', async () => {
    await db.recipes.add(makeRecipe({ id: 'r1' }));
    await db.favorites.add({ uid: 'u1', recipeId: 'r1', createdAt: Date.now() });

    await clearAllRecipes();

    // The recipes half always passed; favourites is the part that survived and
    // left rows pointing at recipes the user had just deleted.
    expect(await db.recipes.count()).toBe(0);
    expect(await db.favorites.count()).toBe(0);
  });
});

describe('applyOwnRecipeSync', () => {
  const me = { uid: 'me', displayName: 'Me' };

  it('overwrites an own row with the cloud copy and keeps its chat history', async () => {
    const chatHistory = [{ role: 'user' as const, content: 'soup', timestamp: 1 }];
    const row = makeRecipe({ id: 'r1', createdBy: me, title: 'Old', chatHistory });
    await db.recipes.add(row);
    const cloud = { ...row, title: 'New', tags: ['soup'], chatHistory: [] };

    await applyOwnRecipeSync('me', [cloud], []);

    expect(await db.recipes.get('r1')).toEqual({ ...row, title: 'New', tags: ['soup'] });
  });

  it('removes own rows an empty snapshot lacks', async () => {
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'r1', createdBy: me }),
      makeRecipe({ id: 'r2', createdBy: me }),
    ]);

    await applyOwnRecipeSync('me', [], []);

    expect(await db.recipes.count()).toBe(0);
  });

  it("removes a previous account's rows and leaves saved copies, 'local' rows and ownerless rows", async () => {
    const ownerless = { ...makeRecipe({ id: 'legacy' }), createdBy: undefined } as unknown as Recipe;
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'old', createdBy: { uid: 'old-uid', displayName: null } }),
      makeRecipe({ id: 'saved', createdBy: { uid: 'someone-else', displayName: 'Ann' } }),
      makeRecipe({ id: 'loc' }),
      ownerless,
    ]);

    await applyOwnRecipeSync('me', [], ['old-uid']);

    expect((await db.recipes.toArray()).map((r) => r.id).sort()).toEqual(['legacy', 'loc', 'saved']);
  });
});

describe('clearOwnRecipes', () => {
  it("removes only the uid's own rows and leaves saved copies, 'local' rows, other uids and favourites", async () => {
    const ownerless = { ...makeRecipe({ id: 'legacy' }), createdBy: undefined } as unknown as Recipe;
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'mine1', createdBy: { uid: 'me', displayName: 'Me' } }),
      makeRecipe({ id: 'mine2', createdBy: { uid: 'me', displayName: 'Me' } }),
      makeRecipe({ id: 'saved', createdBy: { uid: 'someone-else', displayName: 'Ann' } }),
      makeRecipe({ id: 'other', createdBy: { uid: 'old-uid', displayName: null } }),
      makeRecipe({ id: 'loc' }),
      ownerless,
    ]);
    await db.favorites.add({ uid: 'me', recipeId: 'mine1', createdAt: 1 });

    expect(await clearOwnRecipes('me')).toBe(2);

    expect((await db.recipes.toArray()).map((r) => r.id).sort()).toEqual(['legacy', 'loc', 'other', 'saved']);
    expect(await db.favorites.count()).toBe(1);
  });
});

describe('emoji normalised on read (RL-272)', () => {
  it('reads a two-emoji row as one from every reader and leaves the row on disk unchanged', async () => {
    const r = makeRecipe({ id: 'old', title: 'Toast', emoji: '🍞🧈' });
    await db.recipes.put(r);
    expect((await getRecipe('old'))?.emoji).toBe('🍞');
    expect((await getAllRecipes())[0].emoji).toBe('🍞');
    expect((await getRecipeTree('old'))[0].emoji).toBe('🍞');
    expect((await exportAllRecipes())[0].emoji).toBe('🍞');
    expect((await searchRecipes('Toast'))[0].emoji).toBe('🍞');
    expect((await searchVariations('old', 'Toast'))[0].emoji).toBe('🍞');
    expect((await db.recipes.toCollection().raw().toArray())[0].emoji).toBe('🍞🧈');
  });
});
