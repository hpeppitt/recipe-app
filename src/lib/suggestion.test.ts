import { describe, it, expect } from 'vitest';
import {
  composeSuggestionMessage,
  parseAmountText,
  describeEdit,
  describeEdits,
  applySuggestionEdits,
  hasApplicableEdits,
  buildBranchFromSuggestion,
} from './suggestion';
import { makeRecipe, makeIngredient } from '../test/factories';
import type { SuggestionEdit } from '../types/social';

const e = (name: string, oldAmount: string, newAmount: string, why?: string) => ({ name, oldAmount, newAmount, why });

describe('composeSuggestionMessage', () => {
  it('writes one line for one edit', () => {
    expect(composeSuggestionMessage([e('garlic', '2 cloves', '4 cloves')])).toBe('Change 2 cloves garlic to 4 cloves.');
  });
  it('writes one line per edit', () => {
    expect(composeSuggestionMessage([e('garlic', '2 cloves', '4 cloves'), e('salt', '1 tsp', '½ tsp')])).toBe(
      'Change 2 cloves garlic to 4 cloves.\nChange 1 tsp salt to ½ tsp.'
    );
  });
  it('appends the why after the edit', () => {
    expect(composeSuggestionMessage([e('salt', '1 tsp', '½ tsp', 'Too salty for me')])).toBe(
      'Change 1 tsp salt to ½ tsp. Too salty for me'
    );
  });
  it('adds the note after a blank line', () => {
    expect(composeSuggestionMessage([e('salt', '1 tsp', '½ tsp')], 'Bake longer')).toBe(
      'Change 1 tsp salt to ½ tsp.\n\nBake longer'
    );
  });
  it('is just the note when there are no edits', () => {
    expect(composeSuggestionMessage([], 'Bake longer')).toBe('Bake longer');
  });
  it('drops an edit whose amount did not change, and a blank one', () => {
    expect(composeSuggestionMessage([e('salt', '1 tsp', '1 tsp', 'why'), e('oil', '2 tbsp', '  ')])).toBe('');
    expect(composeSuggestionMessage([e('salt', '1 tsp', ' 1 tsp '), e('oil', '2 tbsp', '3 tbsp')])).toBe(
      'Change 2 tbsp oil to 3 tbsp.'
    );
  });
  it('is empty when nothing remains', () => {
    expect(composeSuggestionMessage([], '   ')).toBe('');
  });
  it('trims whitespace', () => {
    expect(composeSuggestionMessage([e(' salt ', ' 1 tsp ', ' 2 tsp ', '  less  ')], '  hi  ')).toBe(
      'Change 1 tsp salt to 2 tsp. less\n\nhi'
    );
  });
  it('copes with an ingredient that has no amount', () => {
    expect(composeSuggestionMessage([e('salt', '', '1 pinch')])).toBe('Change salt to 1 pinch.');
  });
});

const ing = (index: number, name: string, from: string, to: string): SuggestionEdit => ({ kind: 'ingredient', index, name, from, to });
const step = (index: number, from: string, to: string): SuggestionEdit => ({ kind: 'step', index, from, to });
const general = (to: string): SuggestionEdit => ({ kind: 'general', from: '', to });

describe('structured suggestion edits', () => {
  it('parses amounts', () => {
    expect(parseAmountText('100 g')).toEqual({ amount: 100, unit: 'g' });
    expect(parseAmountText('1/2 cup')).toEqual({ amount: 0.5, unit: 'cup' });
    expect(parseAmountText('½ tsp')).toEqual({ amount: 0.5, unit: 'tsp' });
    expect(parseAmountText('1 1/2 cups')).toEqual({ amount: 1.5, unit: 'cups' });
    expect(parseAmountText('1.5 kg')).toEqual({ amount: 1.5, unit: 'kg' });
    expect(parseAmountText('2')).toEqual({ amount: 2, unit: null });
    expect(parseAmountText('')).toBeNull();
    expect(parseAmountText('a pinch')).toBeNull();
    expect(parseAmountText('1/0 cup')).toBeNull();
    expect(parseAmountText('1-2 cups')).toBeNull();
  });
  it('describes edits', () => {
    expect(describeEdit(ing(0, 'light brown sugar', '150 g', '100 g'))).toBe('150 g light brown sugar → 100 g');
    expect(describeEdit(ing(0, 'light brown sugar', '', '100 g'))).toBe('light brown sugar → 100 g');
    expect(describeEdit(step(2, 'a', 'b'))).toBe('Step 3: b');
    expect(describeEdit(step(2, 'a', 'x'.repeat(100)))).toBe(`Step 3: ${'x'.repeat(59)}…`);
    expect(describeEdit(general('y'.repeat(100)))).toBe(`${'y'.repeat(79)}…`);
    expect(describeEdits([general('a'), general('b'), general('c')])).toBe('a and 2 more');
    expect(describeEdits([general('a')])).toBe('a');
  });
  it('composes step edits and general notes', () => {
    expect(composeSuggestionMessage([ing(0, 'salt', '1 tsp', '½ tsp'), step(2, 'old', 'new'), general('Rest it')])).toBe(
      'Change 1 tsp salt to ½ tsp.\nChange step 3 to: new.\n\nRest it'
    );
  });
  it('detects applicable edits', () => {
    expect(hasApplicableEdits([general('x')])).toBe(false);
    expect(hasApplicableEdits([general('x'), step(0, 'a', 'b')])).toBe(true);
  });

  const recipe = () =>
    makeRecipe({
      ingredients: [
        { ...makeIngredient('Sugar'), amount: 150, unit: 'g' },
        { ...makeIngredient('Salt'), amount: 1, unit: 'tsp' },
      ],
      instructions: [
        { step: 1, text: 'Mix.', group: null },
        { step: 2, text: 'Bake.', group: null },
      ],
    });

  it('applies edits without touching the input', () => {
    const r = recipe();
    const res = applySuggestionEdits(r, [ing(0, 'sugar', '150 g', '100 g'), step(1, 'Bake.', 'Bake 5 min longer.'), general('n')]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.ingredients[0]).toMatchObject({ amount: 100, unit: 'g' });
      expect(res.patch.instructions[1].text).toBe('Bake 5 min longer.');
    }
    expect(r.ingredients[0].amount).toBe(150);
  });
  it('appends an unparseable amount to existing notes, and ignores a blank one', () => {
    const r = recipe();
    r.ingredients[1].notes = 'fine';
    const res = applySuggestionEdits(r, [ing(1, 'Salt', '1 tsp', 'a pinch'), ing(0, 'Sugar', '150 g', ' ')]);
    expect(res.ok && res.patch.ingredients[1].notes).toBe('fine; a pinch');
    expect(res.ok && res.patch.ingredients[0]).toMatchObject({ amount: 150, unit: 'g' });
  });
  it('finds a moved ingredient by name', () => {
    const res = applySuggestionEdits(recipe(), [ing(0, 'Salt', '1 tsp', '½ tsp')]);
    expect(res.ok).toBe(true);
  });
  it('is all or nothing and reports stale positions', () => {
    const res = applySuggestionEdits(recipe(), [ing(0, 'Sugar', '150 g', '100 g'), ing(1, 'Salt', '2 tsp', '1 tsp'), step(0, 'Stir.', 'x')]);
    expect(res).toEqual({ ok: false, stale: [1, 2] });
    expect(applySuggestionEdits(recipe(), [ing(0, 'Flour', '1 cup', '2 cups')])).toEqual({ ok: false, stale: [0] });
  });
  it('builds a branch credited to the suggester', () => {
    const parent = recipe();
    const sug = {
      suggestedBy: { uid: 's1', displayName: 'Sam' },
      edits: [ing(0, 'Sugar', '150 g', '100 g')],
    };
    const b = buildBranchFromSuggestion(parent, sug, { uid: 'o', displayName: 'Own' }, 'new-id', 5);
    expect(b).toMatchObject({
      id: 'new-id',
      parentId: parent.id,
      rootId: parent.rootId,
      depth: 1,
      createdBy: { uid: 'o' },
      collaborators: [{ uid: 's1', displayName: 'Sam' }],
      prompt: '150 g Sugar → 100 g',
      chatHistory: [],
      createdAt: 5,
      updatedAt: 5,
      title: parent.title,
    });
    expect(b.ingredients[0].amount).toBe(100);
    expect(() => buildBranchFromSuggestion(parent, { ...sug, edits: [general('x')] }, { uid: 'o', displayName: null }, 'x', 1)).toThrow();
    expect(buildBranchFromSuggestion(parent, sug, { uid: 's1', displayName: null }, 'y', 1).collaborators).toEqual([]);
    expect(() =>
      buildBranchFromSuggestion(parent, { ...sug, edits: [ing(0, 'Sugar', '1 g', '2 g')] }, { uid: 'o', displayName: null }, 'x', 1)
    ).toThrow();
  });
});
