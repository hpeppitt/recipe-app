import { describe, it, expect } from 'vitest';
import {
  recipeToDraft,
  validateDraft,
  draftToPatch,
  isDraftDirty,
  moveItem,
  EMPTY_INGREDIENT,
  EMPTY_INSTRUCTION,
  MAX_TITLE_LENGTH,
  MAX_INGREDIENTS,
  MAX_INSTRUCTIONS,
  type RecipeDraft,
} from './recipeEdit';
// ?raw rather than node:fs, as in rateLimit.test.ts.
import rules from '../../firestore.rules?raw';
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

describe('validateDraft size caps and negative amounts', () => {
  const ing = (name: string) => ({ ...EMPTY_INGREDIENT, name });
  const step = (text: string) => ({ ...EMPTY_INSTRUCTION, text });

  it('rejects a negative amount and keeps blank amounts valid', () => {
    const neg = draftOf({ ingredients: [{ ...ing('flour'), amount: '-1' }] });
    expect(validateDraft(neg).ingredients).toBe("Amounts can't be negative.");
    expect(validateDraft(draftOf({ ingredients: [ing('flour')] })).ingredients).toBeUndefined();
  });

  it('title: at the cap passes, one over fails, measured trimmed', () => {
    expect(validateDraft(draftOf({ title: 'a'.repeat(MAX_TITLE_LENGTH) })).title).toBeUndefined();
    expect(validateDraft(draftOf({ title: ` ${'a'.repeat(MAX_TITLE_LENGTH)} ` })).title).toBeUndefined();
    expect(validateDraft(draftOf({ title: 'a'.repeat(MAX_TITLE_LENGTH + 1) })).title).toBe(
      `Titles can be at most ${MAX_TITLE_LENGTH} characters.`
    );
  });

  it('ingredients: cap passes, one over fails, blank rows ignored', () => {
    const rows = Array.from({ length: MAX_INGREDIENTS }, () => ing('x'));
    const blanks = [{ ...EMPTY_INGREDIENT }, { ...EMPTY_INGREDIENT }];
    expect(validateDraft(draftOf({ ingredients: [...rows, ...blanks] })).ingredients).toBeUndefined();
    expect(validateDraft(draftOf({ ingredients: [...rows, ing('y')] })).ingredients).toBe(
      `A recipe can have at most ${MAX_INGREDIENTS} ingredients.`
    );
  });

  it('negative amount wins over the count cap', () => {
    const rows = Array.from({ length: MAX_INGREDIENTS + 1 }, () => ing('x'));
    rows[0] = { ...rows[0], amount: '-2' };
    expect(validateDraft(draftOf({ ingredients: rows })).ingredients).toBe("Amounts can't be negative.");
  });

  it('instructions: cap passes, one over fails, blank rows ignored', () => {
    const rows = Array.from({ length: MAX_INSTRUCTIONS }, () => step('do'));
    expect(
      validateDraft(draftOf({ instructions: [...rows, { ...EMPTY_INSTRUCTION }] })).instructions
    ).toBeUndefined();
    expect(validateDraft(draftOf({ instructions: [...rows, step('more')] })).instructions).toBe(
      `A recipe can have at most ${MAX_INSTRUCTIONS} steps.`
    );
  });

  it('constants equal the caps in firestore.rules', () => {
    const grab = (re: RegExp) => {
      const m = rules.match(re);
      if (!m) throw new Error(`pattern not found in firestore.rules: ${re}`);
      return Number(m[1]);
    };
    expect(grab(/d\.title\.size\(\) <= (\d+)/)).toBe(MAX_TITLE_LENGTH);
    expect(grab(/d\.ingredients\.size\(\) <= (\d+)/)).toBe(MAX_INGREDIENTS);
    expect(grab(/d\.instructions\.size\(\) <= (\d+)/)).toBe(MAX_INSTRUCTIONS);
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

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves forward and backward', () => {
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('moves to the ends', () => {
    expect(moveItem(list, 1, 0)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItem(list, 2, 3)).toEqual(['a', 'b', 'd', 'c']);
  });
  it('returns the list unchanged for the same or an out-of-range index', () => {
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 2)).toBe(list);
    expect(moveItem(list, 0, 4)).toBe(list);
    expect(moveItem(list, 4, 0)).toBe(list);
  });
  it('does not mutate its input', () => {
    moveItem(list, 0, 3);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});
