import { describe, expect, it } from 'vitest';
import { orderChips, promptMatchesChip, splitChips } from './branchChips';

const CHIPS = ['Less sugar', 'Vegetarian', 'Vegan', 'Gluten-free', 'Quicker', 'Spicier'];

describe('promptMatchesChip', () => {
  it('matches the label and synonyms case-insensitively', () => {
    expect(promptMatchesChip('Make it VEGAN', 'Vegan')).toBe(true);
    expect(promptMatchesChip('reduced sugar please', 'Less sugar')).toBe(true);
    expect(promptMatchesChip('lower sugar', 'Less sugar')).toBe(true);
    expect(promptMatchesChip('make it faster', 'Quicker')).toBe(true);
    expect(promptMatchesChip('gluten free', 'Gluten-free')).toBe(true);
    expect(promptMatchesChip('more heat', 'Spicier')).toBe(true);
    expect(promptMatchesChip('spicy', 'Spicier')).toBe(true);
  });
  it('does not match unrelated prompts', () => {
    expect(promptMatchesChip('add walnuts', 'Vegan')).toBe(false);
  });
});

describe('orderChips', () => {
  it('returns the input order with no prompts', () => {
    expect(orderChips(CHIPS, [])).toEqual(CHIPS);
    expect(orderChips([], ['vegan'])).toEqual([]);
  });
  it('sorts by use, ties in original order', () => {
    const out = orderChips(CHIPS, ['spicy', 'more heat', 'vegan', 'faster']);
    expect(out.slice(0, 3)).toEqual(['Spicier', 'Vegan', 'Quicker']);
    expect(out.slice(3)).toEqual(['Less sugar', 'Vegetarian', 'Gluten-free']);
  });
});

describe('splitChips', () => {
  it('handles empty inputs', () => {
    expect(splitChips(CHIPS, [])).toEqual({ untried: CHIPS, tried: [] });
    expect(splitChips([], [{ id: 'a', prompt: 'vegan' }])).toEqual({ untried: [], tried: [] });
  });
  it('splits and picks the first child when two match', () => {
    const r = splitChips(CHIPS, [
      { id: 'a', prompt: 'make it vegan' },
      { id: 'b', prompt: 'Vegan and quick' },
      { id: 'c', prompt: 'gluten free' },
    ]);
    expect(r.tried).toEqual([
      { chip: 'Vegan', childId: 'a' },
      { chip: 'Gluten-free', childId: 'c' },
      { chip: 'Quicker', childId: 'b' },
    ]);
    expect(r.untried).toEqual(['Less sugar', 'Vegetarian', 'Spicier']);
  });
});
