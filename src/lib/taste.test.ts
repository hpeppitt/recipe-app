import { describe, expect, it } from 'vitest';
import { learnTaste, tasteHeadline } from './taste';

const cook = (title: string, tags: string[], at = 1) => ({ title, tags, at });
const br = (prompt: string, at = 1) => ({ prompt, at });

describe('learnTaste', () => {
  it('needs 2 occurrences, uses tags and title dish words, sentence case', () => {
    const t = learnTaste({
      cookedRecipes: [cook('Peanut Noodles', ['Quick']), cook('Sesame noodles', ['quick ']), cook('Soup', ['once'])],
      branchPrompts: [],
      hidden: [],
    });
    expect(t.cookALot).toEqual(['Noodles', 'Quick']);
    expect(t.cookCount).toBe(3);
  });
  it('counts a term once per recipe', () => {
    const t = learnTaste({ cookedRecipes: [cook('Soup soup', ['soup'])], branchPrompts: [], hidden: [] });
    expect(t.cookALot).toEqual([]);
  });
  it('groups branch prompts by synonym and needs 2', () => {
    const t = learnTaste({
      cookedRecipes: [],
      branchPrompts: [br('make it vegan'), br('lower sugar'), br('reduced sugar'), br('more greens'), br('More greens please')],
      hidden: [],
    });
    expect(t.tendToChange).toEqual(['Less sugar', 'More greens']);
    expect(t.branchCount).toBe(5);
  });
  it('caps at 5 terms', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f'];
    const t = learnTaste({ cookedRecipes: [cook('x', tags), cook('y', tags)], branchPrompts: [], hidden: [] });
    expect(t.cookALot).toHaveLength(5);
  });
  it('removes hidden terms, ignoring case', () => {
    const t = learnTaste({
      cookedRecipes: [cook('Curry', []), cook('Curry', [])],
      branchPrompts: [br('quicker'), br('faster')],
      hidden: ['curry', 'QUICKER'],
    });
    expect(t.cookALot).toEqual([]);
    expect(t.tendToChange).toEqual([]);
  });
  it('breaks ties by most recent', () => {
    const t = learnTaste({
      cookedRecipes: [cook('a', ['old'], 1), cook('b', ['old'], 2), cook('c', ['new'], 9), cook('d', ['new'], 3)],
      branchPrompts: [],
      hidden: [],
    });
    expect(t.cookALot).toEqual(['New', 'Old']);
  });
});

describe('tasteHeadline', () => {
  it('handles empty, singular and plural', () => {
    expect(tasteHeadline(0, 0)).toBe('Cook and branch a few recipes and this fills in.');
    expect(tasteHeadline(14, 6)).toBe('Learned from 14 cooks and 6 branches.');
    expect(tasteHeadline(1, 1)).toBe('Learned from 1 cook and 1 branch.');
    expect(tasteHeadline(0, 2)).toBe('Learned from 0 cooks and 2 branches.');
  });
});
