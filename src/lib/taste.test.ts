import { describe, expect, it } from 'vitest';
// ?raw rather than node:fs, as in rateLimit.test.ts.
import rules from '../../firestore.rules?raw';
import { learnTaste, normaliseAvoids, normaliseHidden, tasteHeadline, TASTE_AVOID_MAX, TASTE_HIDDEN_MAX, TASTE_TERM_MAX } from './taste';

describe('firestore.rules taste profile caps (RL-230)', () => {
  // Fails, rather than passing vacuously, when a function is renamed or removed.
  const literal = (fn: string) => {
    const m = new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return (\\d+);`).exec(rules);
    return m ? Number(m[1]) : undefined;
  };

  it('match the client constants and apply to both lists', () => {
    expect(literal('tasteAvoidCap')).toBe(TASTE_AVOID_MAX);
    expect(literal('tasteHiddenCap')).toBe(TASTE_HIDDEN_MAX);
    expect(literal('tasteTermMax')).toBe(TASTE_TERM_MAX);
    expect(rules).toContain('a.size() <= tasteAvoidCap()');
    expect(rules).toContain('(avoids[i] is string && avoids[i].size() <= tasteTermMax())');
    // One guarded check per avoid slot, 0 to cap - 1.
    for (let i = 0; i < TASTE_AVOID_MAX; i++) expect(rules).toContain(`tasteAvoidOk(a, ${i})`);
    expect(rules).not.toContain(`tasteAvoidOk(a, ${TASTE_AVOID_MAX})`);
    expect(rules).toContain('tasteAvoidsOk(request.resource.data.avoids)');
    expect(rules).toContain('hidden.size() <= tasteHiddenCap()');
    expect(rules).toContain("hidden.join('').size() <= tasteHiddenCap() * tasteTermMax()");
  });
});

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

describe('normalisers (RL-231)', () => {
  it('puts avoids in one line, sentence case, deduped, 40 characters, at most 12', () => {
    expect(normaliseAvoids(['  fresh   CORIANDER ', 'coriander', 'a\nb\u0000c', '', 7])).toEqual(['Fresh coriander', 'Coriander', 'A b c']);
    expect(normaliseAvoids(['Mushrooms', 'mushrooms'])).toEqual(['Mushrooms']);
    expect(normaliseAvoids(['x'.repeat(60)])[0]).toHaveLength(TASTE_TERM_MAX);
    expect(normaliseAvoids(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(TASTE_AVOID_MAX);
    expect(normaliseAvoids('nope')).toEqual([]);
  });

  it('cuts to 40 code points after case folding, never splitting a pair', () => {
    const out = normaliseAvoids(['\u0130'.repeat(40), 'ß'.repeat(30), '\u{1F35C}'.repeat(60)]);
    for (const t of out) expect(Array.from(t).length).toBeLessThanOrEqual(TASTE_TERM_MAX);
    expect(out[1].startsWith('SS')).toBe(true);
    expect(out[2]).toBe('\u{1F35C}'.repeat(40));
  });

  it('keeps only short strings in hidden, deduped, newest 50', () => {
    expect(normaliseHidden(['Curry', 'curry', 4, null, 'x'.repeat(41), ' a\tb '])).toEqual(['Curry', 'a b']);
    const many = Array.from({ length: 60 }, (_, i) => `t${i}`);
    const out = normaliseHidden(many);
    expect(out).toHaveLength(TASTE_HIDDEN_MAX);
    expect(out.at(-1)).toBe('t59');
  });
});
