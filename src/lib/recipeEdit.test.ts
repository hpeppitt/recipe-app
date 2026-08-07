import { describe, it, expect } from 'vitest';
import {
  recipeToDraft,
  validateDraft,
  draftToPatch,
  isDraftDirty,
  EMPTY_INGREDIENT,
  EMPTY_INSTRUCTION,
  type RecipeDraft,
} from './recipeEdit';
import { makeRecipe } from '../test/factories';
import type { Recipe } from '../types/recipe';

/**
 * `makeRecipe` has no ingredients or instructions by default, which is a state no
 * saved recipe reaches. A base with both is what the editor actually loads.
 */
function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return makeRecipe({
    title: 'Loaf',
    description: 'A loaf.',
    ingredients: [
      { amount: 500, unit: 'g', name: 'flour', notes: null, group: null },
      { amount: null, unit: null, name: 'salt', notes: 'to taste', group: null },
    ],
    instructions: [
      { step: 1, text: 'Mix.', group: null },
      { step: 2, text: 'Bake.', group: null },
    ],
    notes: ['Keeps three days.'],
    tags: ['bread'],
    ...overrides,
  });
}

function draftOf(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return { ...recipeToDraft(baseRecipe()), ...overrides };
}

describe('recipeToDraft', () => {
  it('round-trips through draftToPatch without changing the recipe', () => {
    const recipe = baseRecipe({ prepTime: 10, cookTime: 40, totalTime: 50 });
    const patch = draftToPatch(recipeToDraft(recipe), recipe);
    expect(patch.title).toBe('Loaf');
    expect(patch.ingredients).toEqual(recipe.ingredients);
    expect(patch.instructions).toEqual(recipe.instructions);
    expect(patch.notes).toEqual(recipe.notes);
    expect(patch.tags).toEqual(recipe.tags);
    expect(patch.totalTime).toBe(50);
  });

  it('represents an absent amount as an empty string, not "null"', () => {
    const draft = recipeToDraft(baseRecipe());
    expect(draft.ingredients[1].amount).toBe('');
    expect(draft.ingredients[1].unit).toBe('');
  });
});

describe('validateDraft', () => {
  it('accepts the draft of an existing recipe', () => {
    expect(validateDraft(draftOf())).toEqual({});
  });

  it('requires a title', () => {
    expect(validateDraft(draftOf({ title: '   ' })).title).toBeDefined();
  });

  it('requires at least one ingredient', () => {
    expect(validateDraft(draftOf({ ingredients: [{ ...EMPTY_INGREDIENT }] })).ingredients)
      .toBeDefined();
  });

  it('requires at least one step', () => {
    expect(validateDraft(draftOf({ instructions: [{ ...EMPTY_INSTRUCTION }] })).instructions)
      .toBeDefined();
  });

  // A half-typed row is the normal state of a form, not an error to shout about.
  it('ignores a wholly blank ingredient row alongside a real one', () => {
    const errors = validateDraft(
      draftOf({
        ingredients: [
          { amount: '2', unit: 'cups', name: 'flour', notes: '', group: '' },
          { ...EMPTY_INGREDIENT },
        ],
      })
    );
    expect(errors.ingredients).toBeUndefined();
  });

  it('rejects an amount with no ingredient name rather than dropping what was typed', () => {
    const errors = validateDraft(
      draftOf({
        ingredients: [{ amount: '2', unit: 'cups', name: '', notes: '', group: '' }],
      })
    );
    expect(errors.ingredients).toContain('name');
  });

  it('rejects a non-numeric amount and says where ranges go', () => {
    const errors = validateDraft(
      draftOf({
        ingredients: [{ amount: '2-3', unit: '', name: 'eggs', notes: '', group: '' }],
      })
    );
    expect(errors.ingredients).toContain('notes');
  });

  it('rejects negative and zero servings', () => {
    expect(validateDraft(draftOf({ servings: '-1' })).servings).toBeDefined();
    expect(validateDraft(draftOf({ servings: '0' })).servings).toBeDefined();
  });

  it('allows a blank time, which means unspecified', () => {
    expect(validateDraft(draftOf({ prepTime: '' })).prepTime).toBeUndefined();
  });

  it('rejects a non-numeric time', () => {
    expect(validateDraft(draftOf({ cookTime: 'about an hour' })).cookTime).toBeDefined();
  });
});

describe('draftToPatch', () => {
  const recipe = baseRecipe();

  it('renumbers steps so deleting one does not leave a gap', () => {
    const patch = draftToPatch(
      draftOf({
        instructions: [
          { text: 'First', group: '' },
          { text: '   ', group: '' },
          { text: 'Third', group: '' },
        ],
      }),
      recipe
    );
    expect(patch.instructions.map((i) => i.step)).toEqual([1, 2]);
    expect(patch.instructions.map((i) => i.text)).toEqual(['First', 'Third']);
  });

  it('drops blank ingredient rows and trims the rest', () => {
    const patch = draftToPatch(
      draftOf({
        ingredients: [
          { amount: ' 2 ', unit: ' cups ', name: ' flour ', notes: '', group: '' },
          { ...EMPTY_INGREDIENT },
        ],
      }),
      recipe
    );
    expect(patch.ingredients).toEqual([
      { amount: 2, unit: 'cups', name: 'flour', notes: null, group: null },
    ]);
  });

  it('stores an unspecified amount as null rather than 0', () => {
    const patch = draftToPatch(
      draftOf({
        ingredients: [{ amount: '', unit: '', name: 'salt', notes: 'to taste', group: '' }],
      }),
      recipe
    );
    expect(patch.ingredients[0].amount).toBeNull();
    expect(patch.ingredients[0].unit).toBeNull();
  });

  it('derives totalTime instead of trusting a third editable field', () => {
    const patch = draftToPatch(draftOf({ prepTime: '15', cookTime: '45' }), recipe);
    expect(patch.totalTime).toBe(60);
  });

  it('treats a cleared time as zero for the total', () => {
    const patch = draftToPatch(draftOf({ prepTime: '', cookTime: '20' }), recipe);
    expect(patch.prepTime).toBe(0);
    expect(patch.totalTime).toBe(20);
  });

  it('splits tags and discards empties', () => {
    const patch = draftToPatch(draftOf({ tags: ' bread , , baking ' }), recipe);
    expect(patch.tags).toEqual(['bread', 'baking']);
  });

  it('keeps the previous emoji when the field is cleared', () => {
    const withEmoji = baseRecipe({ emoji: '🍞' });
    const patch = draftToPatch({ ...recipeToDraft(withEmoji), emoji: '  ' }, withEmoji);
    expect(patch.emoji).toBe('🍞');
  });

  it('keeps previous servings when the field is cleared', () => {
    const served = baseRecipe({ servings: 6 });
    const patch = draftToPatch({ ...recipeToDraft(served), servings: '' }, served);
    expect(patch.servings).toBe(6);
  });

  // The patch is the write boundary: identity and tree position are not content.
  it('cannot reach ownership, identity or tree fields', () => {
    const patch = draftToPatch(draftOf(), recipe) as Record<string, unknown>;
    for (const forbidden of [
      'id',
      'createdBy',
      'collaborators',
      'parentId',
      'rootId',
      'depth',
      'chatHistory',
      'prompt',
      'createdAt',
    ]) {
      expect(patch).not.toHaveProperty(forbidden);
    }
  });
});

describe('isDraftDirty', () => {
  it('is false for an untouched draft', () => {
    const recipe = baseRecipe();
    expect(isDraftDirty(recipeToDraft(recipe), recipe)).toBe(false);
  });

  it('is true once a field changes', () => {
    const recipe = baseRecipe();
    expect(isDraftDirty({ ...recipeToDraft(recipe), title: 'Different' }, recipe)).toBe(true);
  });

  // Guards the string/number asymmetry: a naive comparison would call a
  // freshly-mounted form dirty and prompt to discard nothing.
  it('does not report a phantom change for numeric fields', () => {
    const recipe = baseRecipe({ servings: 4, prepTime: 0 });
    expect(isDraftDirty(recipeToDraft(recipe), recipe)).toBe(false);
  });
});
