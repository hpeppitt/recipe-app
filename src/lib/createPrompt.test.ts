import { describe, it, expect } from 'vitest';
import { CREATE_OPTIONS, DEFAULT_SELECTION, buildCreatePrompt, cycleWord, type CreateSelection, type CreateSlot } from './createPrompt';

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
