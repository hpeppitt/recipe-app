import { describe, it, expect } from 'vitest';
import { CREATE_OPTIONS, DEFAULT_SELECTION, buildCreatePrompt, buildPantryPrompt, createTerms, cycleWord, keptAvoids, type CreateSelection, type CreateSlot } from './createPrompt';

describe('createPrompt', () => {
  it('builds the default prompt from the first options', () => {
    expect(buildCreatePrompt(DEFAULT_SELECTION)).toBe('Something quick with chickpeas for two');
  });

  it.each([0, 1, 2] as CreateSlot[])('cycles slot %i through its three options and wraps', (slot) => {
    let s: CreateSelection = DEFAULT_SELECTION;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(s[slot]);
      s = cycleWord(s, slot);
    }
    expect(seen).toEqual([0, 1, 2, 0]);
    expect(CREATE_OPTIONS[slot]).toHaveLength(3);
  });

  it('leaves the other slots alone', () => {
    expect(cycleWord([2, 1, 0], 1)).toEqual([2, 2, 0]);
    expect(cycleWord([2, 1, 0], 0)).toEqual([0, 1, 0]);
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
