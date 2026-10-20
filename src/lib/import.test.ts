import { describe, it, expect } from 'vitest';
import { parseImportedRecipes, describeImport } from './import';
import { makeRecipe, makeIngredient } from '../test/factories';

const NOW = 1_700_000_000_000;

describe('parseImportedRecipes', () => {
  it('accepts a well-formed export', () => {
    const result = parseImportedRecipes([makeRecipe({ id: 'a', title: 'Soup' })], NOW);

    expect(result.skipped).toBe(0);
    expect(result.recipes.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps relatedFamilyId through a restore (RL-162)', () => {
    const [r] = parseImportedRecipes([makeRecipe({ id: 'a', relatedFamilyId: 'fam' })], NOW).recipes;
    expect(r.relatedFamilyId).toBe('fam');
  });

  it('rejects anything that is not an array', () => {
    for (const raw of [null, undefined, 42, 'nope', { recipes: [] }]) {
      expect(parseImportedRecipes(raw, NOW).recipes).toEqual([]);
    }
  });

  // The FUN-6 crash: these shapes used to be persisted, then blew up inside
  // searchRecipes when it spread tags or mapped ingredients[].name.
  it('drops records that would break searchRecipes', () => {
    const bad = [
      { ...makeRecipe({ id: 'no-tags' }), tags: undefined },
      { ...makeRecipe({ id: 'tags-not-array' }), tags: 'spicy' },
      { ...makeRecipe({ id: 'no-ingredients' }), ingredients: undefined },
      { ...makeRecipe({ id: 'ingredient-missing-name' }), ingredients: [{ amount: 1 }] },
      { ...makeRecipe({ id: 'no-title' }), title: undefined },
      { ...makeRecipe({ id: '' }) },
      'not an object',
      null,
    ];

    const result = parseImportedRecipes(bad, NOW);

    expect(result.recipes).toEqual([]);
    expect(result.skipped).toBe(bad.length);
  });

  it('keeps the good records and counts only the bad ones', () => {
    const result = parseImportedRecipes(
      [makeRecipe({ id: 'good-1' }), { garbage: true }, makeRecipe({ id: 'good-2' })],
      NOW
    );

    expect(result.recipes.map((r) => r.id).sort()).toEqual(['good-1', 'good-2']);
    expect(result.skipped).toBe(1);
  });

  it('backfills envelope fields missing from an older export', () => {
    // Pre-v2/v3 exports have no createdBy or collaborators, and rejecting them
    // outright would make old backups unimportable.
    const legacy = {
      id: 'legacy-1',
      title: 'Legacy Stew',
      description: 'from an old backup',
      ingredients: [makeIngredient('beef')],
      instructions: [{ step: 1, text: 'Simmer', group: null }],
      notes: [],
      prepTime: 10,
      cookTime: 60,
      totalTime: 70,
      servings: 4,
      difficulty: 'easy',
      tags: ['stew'],
      emoji: '🍲',
    };

    const { recipes, skipped } = parseImportedRecipes([legacy], NOW);

    expect(skipped).toBe(0);
    expect(recipes[0]).toMatchObject({
      id: 'legacy-1',
      rootId: 'legacy-1',
      parentId: null,
      depth: 0,
      createdBy: { uid: 'local', displayName: null },
      collaborators: [],
      prompt: '',
      chatHistory: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('defaults rootId to the recipe id but keeps an explicit one', () => {
    const { recipes } = parseImportedRecipes(
      [makeRecipe({ id: 'child', rootId: 'parent-root' })],
      NOW
    );

    expect(recipes[0].rootId).toBe('parent-root');
  });

  it('merges duplicate ids inside one file, last occurrence winning', () => {
    const result = parseImportedRecipes(
      [makeRecipe({ id: 'dupe', title: 'First' }), makeRecipe({ id: 'dupe', title: 'Second' })],
      NOW
    );

    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].title).toBe('Second');
    expect(result.duplicatesInFile).toBe(1);
  });

  describe('owner stamping', () => {
    const owners = (protectedUids: string[]) =>
      parseImportedRecipes(
        [
          makeRecipe({ id: 'mine', createdBy: { uid: 'me', displayName: 'Me' } }),
          makeRecipe({ id: 'old', createdBy: { uid: 'old-me', displayName: 'Old Me' } }),
          makeRecipe({ id: 'theirs', createdBy: { uid: 'alice', displayName: 'Alice' } }),
          { ...makeRecipe({ id: 'none' }), createdBy: undefined },
        ],
        NOW,
        protectedUids
      ).recipes.map((r) => [r.id, r.createdBy]);

    it("re-stamps the importer's uid and a previous uid as 'local', keeping the name", () => {
      expect(owners(['me', 'old-me'])).toEqual([
        ['mine', { uid: 'local', displayName: 'Me' }],
        ['old', { uid: 'local', displayName: 'Old Me' }],
        ['theirs', { uid: 'alice', displayName: 'Alice' }],
        ['none', { uid: 'local', displayName: null }],
      ]);
    });

    it('changes no owner when no uids are protected', () => {
      expect(owners([]).map(([, by]) => by)).toEqual([
        { uid: 'me', displayName: 'Me' },
        { uid: 'old-me', displayName: 'Old Me' },
        { uid: 'alice', displayName: 'Alice' },
        { uid: 'local', displayName: null },
      ]);
    });
  });
});

describe('describeImport', () => {
  it('reports each non-zero category', () => {
    const msg = describeImport({ added: 3, replaced: 2, skipped: 1, duplicatesInFile: 1 });

    expect(msg).toContain('3 added');
    expect(msg).toContain('2 updated');
    expect(msg).toContain('1 duplicate merged');
    expect(msg).toContain('1 skipped as invalid');
  });

  it('omits categories that are zero', () => {
    const msg = describeImport({ added: 5, replaced: 0, skipped: 0, duplicatesInFile: 0 });

    expect(msg).toBe('Import complete: 5 added.');
  });

  it('says so when nothing usable was found', () => {
    const msg = describeImport({ added: 0, replaced: 0, skipped: 4, duplicatesInFile: 0 });

    expect(msg).toMatch(/nothing to import/i);
  });

  it('counts rows already in the account', () => {
    expect(
      describeImport({ added: 1, replaced: 0, skipped: 0, duplicatesInFile: 0, alreadyInAccount: 4 })
    ).toBe('Import complete: 1 added. 4 already in your account, left as they are.');
    expect(
      describeImport({ added: 0, replaced: 0, skipped: 0, duplicatesInFile: 0, alreadyInAccount: 2 })
    ).toBe('Nothing new to import. 2 already in your account, left as they are.');
  });
});
