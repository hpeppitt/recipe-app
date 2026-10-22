import { describe, it, expect } from 'vitest';
import { CREATE_OPTIONS, DEFAULT_SELECTION, buildCreatePrompt, addSlot, buildPantryPrompt, createTerms, cycleWord, keptAvoids, removeSlot, selectedWords, type CreateSelection, type CreateSlot } from './createPrompt';

describe('createPrompt', () => {
  it('builds the default prompt from the first options', () => {
    expect(buildCreatePrompt(DEFAULT_SELECTION)).toBe('Something quick with chickpeas for two');
  });

  it.each([0, 1, 2] as CreateSlot[])('cycles slot %i through its three options and wraps', (slot) => {
    let s: CreateSelection = DEFAULT_SELECTION;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(s[slot] as number);
      s = cycleWord(s, slot);
    }
    expect(seen).toEqual([0, 1, 2, 0]);
    expect(CREATE_OPTIONS[slot]).toHaveLength(3);
  });

  it('leaves the other slots alone', () => {
    expect(cycleWord([2, 1, 0], 1)).toEqual([2, 2, 0, null, null, null]);
    expect(cycleWord([2, 1, 0], 0)).toEqual([0, 1, 0, null, null, null]);
  });

  it('builds the prompt from a changed selection', () => {
    expect(buildCreatePrompt([1, 1, 1])).toBe('Something one-pan with salmon for a crowd');
    expect(buildCreatePrompt([2, 2, 2])).toBe('Something slow-cooked with mushrooms for lunchboxes');
  });

  it('does not mutate its input', () => {
    const input: CreateSelection = Object.freeze([0, 0, 0] as const);
    const out = cycleWord(input, 2);
    expect(input).toEqual([0, 0, 0]);
    expect(out).not.toBe(input);
  });
});

describe('buildPantryPrompt', () => {
  it('handles 0, 1, 2 and 3 items', () => {
    expect(buildPantryPrompt([], 'any')).toBe('Something with what I have');
    expect(buildPantryPrompt(['eggs'], 'any')).toBe('Something with eggs');
    expect(buildPantryPrompt(['eggs', 'feta'], 'any')).toBe('Something with eggs and feta');
    expect(buildPantryPrompt(['eggs', 'tomatoes', 'feta'], 'any')).toBe('Something with eggs, tomatoes and feta');
  });

  it('adds the time limit', () => {
    expect(buildPantryPrompt(['eggs'], '30')).toBe('Something with eggs in under 30 minutes');
    expect(buildPantryPrompt(['eggs'], '60')).toBe('Something with eggs in under an hour');
    expect(buildPantryPrompt([], '15')).toBe('Something with what I have in under 15 minutes');
  });
});

describe('profile terms (RL-235)', () => {
  it('appends none, one or several kept terms', () => {
    expect(buildCreatePrompt(DEFAULT_SELECTION, [])).toBe('Something quick with chickpeas for two');
    expect(buildCreatePrompt(DEFAULT_SELECTION, ['no peanuts'])).toBe('Something quick with chickpeas for two, no peanuts');
    expect(buildCreatePrompt(DEFAULT_SELECTION, ['no peanuts', 'no pork', 'under 30 min'])).toBe(
      'Something quick with chickpeas for two, no peanuts, no pork, under 30 min'
    );
  });

  it('builds "no <avoid>" terms, then "under 30 min" only when Quicker is learned', () => {
    expect(createTerms([], [])).toEqual([]);
    expect(createTerms(['Peanuts', 'Pork'], ['Spicier'])).toEqual([
      { label: 'no peanuts', avoid: 'Peanuts' },
      { label: 'no pork', avoid: 'Pork' },
    ]);
    expect(createTerms(['Peanuts'], ['Vegan', 'Quicker'])).toEqual([
      { label: 'no peanuts', avoid: 'Peanuts' },
      { label: 'under 30 min', avoid: null },
    ]);
  });

  it('keptAvoids removes only stored avoids, matched case-insensitively', () => {
    const stored = ['Peanuts', 'Pork', 'Fish'];
    expect(keptAvoids(stored, undefined)).toEqual(stored);
    expect(keptAvoids(stored, 'Peanuts')).toEqual(stored);
    expect(keptAvoids(stored, ['  PEANUTS ', 'fish'])).toEqual(['Pork']);
    expect(keptAvoids(stored, ['Shellfish', 42, null, { a: 1 }])).toEqual(stored);
  });
});

describe('optional extras (RL-276)', () => {
  it('leaves the default sentence unchanged and the extras unset', () => {
    expect(buildCreatePrompt([0, 0, 0, null, null, null])).toBe('Something quick with chickpeas for two');
    expect(selectedWords(DEFAULT_SELECTION).slice(3)).toEqual([null, null, null]);
  });

  it.each([
    [3, 6, 'Something quick with chickpeas and spinach for two'],
    [4, 3, 'Something quick with chickpeas, ready in 15 minutes for two'],
    [5, 4, 'Something quick with chickpeas on the stove for two'],
  ] as [CreateSlot, number, string][])('slot %i adds, cycles through %i options, wraps and removes', (slot, n, added) => {
    let s = addSlot(DEFAULT_SELECTION, slot);
    expect(buildCreatePrompt(s)).toBe(added);
    expect(addSlot(s, slot)).toBe(s);
    for (let i = 0; i < n; i++) s = cycleWord(s, slot);
    expect(s[slot]).toBe(0);
    expect(CREATE_OPTIONS[slot]).toHaveLength(n);
    expect(buildCreatePrompt(removeSlot(s, slot))).toBe('Something quick with chickpeas for two');
  });

  it('cycling an unset slot starts at its first option', () => {
    expect(cycleWord(DEFAULT_SELECTION, 3)[3]).toBe(0);
  });

  it('builds all extras in order, then the profile terms', () => {
    expect(buildCreatePrompt([1, 2, 1, 2, 1, 1], ['no pork'])).toBe(
      'Something one-pan with mushrooms and courgette in the oven, ready in 30 minutes for a crowd, no pork'
    );
    expect(buildCreatePrompt([0, 0, 0, 5, null, 3])).toBe('Something quick with chickpeas and carrots in the pressure cooker for two');
  });

  it('does not mutate its input and keeps other slots', () => {
    const input: CreateSelection = Object.freeze([2, 1, 0, null, 1, null] as const);
    const out = addSlot(input, 3);
    expect(input).toEqual([2, 1, 0, null, 1, null]);
    expect(out).toEqual([2, 1, 0, 0, 1, null]);
  });

  it('drops the learned "under 30 min" term when a time slot is added', () => {
    expect(createTerms([], ['Quicker'], true)).toEqual([]);
    expect(createTerms(['Pork'], ['Quicker'], true)).toEqual([{ label: 'no pork', avoid: 'Pork' }]);
    expect(createTerms([], ['Quicker'], false)).toEqual([{ label: 'under 30 min', avoid: null }]);
  });
});
