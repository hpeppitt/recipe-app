import { describe, it, expect } from 'vitest';
import { dietLabel } from './diet';

describe('dietLabel', () => {
  it.each([
    ['vegan', 'Vegan'],
    ['vegetarian', 'Vegetarian'],
    ['pescatarian', 'Pescatarian'],
    ['gluten-free', 'Gluten-free'],
    ['dairy-free', 'Dairy-free'],
    ['keto', 'Keto'],
    ['paleo', 'Paleo'],
  ])('%s gives %s', (tag, label) => {
    expect(dietLabel([tag])).toBe(label);
  });

  it('vegan beats vegetarian regardless of order', () => {
    expect(dietLabel(['vegetarian', 'vegan'])).toBe('Vegan');
  });

  it('ignores case, spaces and hyphens', () => {
    expect(dietLabel(['Gluten Free'])).toBe('Gluten-free');
    expect(dietLabel(['glutenfree'])).toBe('Gluten-free');
    expect(dietLabel(['VEGETARIAN'])).toBe('Vegetarian');
  });

  it('gives null for empty and unknown tags', () => {
    expect(dietLabel([])).toBeNull();
    expect(dietLabel(['quick', 'dinner'])).toBeNull();
  });
});
