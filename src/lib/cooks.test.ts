import { describe, expect, it } from 'vitest';
import { makeCook } from '../test/factories';
import {
  COOK_TAGS,
  cookLogSummary,
  cookTag,
  cookWhen,
  cookWhenLine,
  madeByLine,
  noteToBranchPrompt,
  recentCooks,
} from './cooks';

describe('madeByLine', () => {
  it('formats the cases', () => {
    expect(madeByLine(0, 0)).toBeNull();
    expect(madeByLine(31, 27)).toBe('Made 31 times · 27 would make again');
    expect(madeByLine(1, 1)).toBe('Made once · would make again');
    expect(madeByLine(1, 0)).toBe('Made once');
    expect(madeByLine(2, 0)).toBe('Made 2 times');
    expect(madeByLine(5, 1)).toBe('Made 5 times · 1 would make again');
  });
});

describe('recentCooks', () => {
  it('is distinct by uid, newest first, capped', () => {
    const cooks = [
      makeCook({ uid: 'a', createdAt: 1 }),
      makeCook({ uid: 'b', createdAt: 5 }),
      makeCook({ uid: 'a', createdAt: 4 }),
      makeCook({ uid: 'c', createdAt: 3 }),
      makeCook({ uid: 'd', createdAt: 2 }),
    ];
    expect(recentCooks(cooks).map((c) => [c.uid, c.createdAt])).toEqual([['b', 5], ['a', 4], ['c', 3]]);
    expect(recentCooks(cooks, 10)).toHaveLength(4);
    expect(recentCooks([])).toEqual([]);
  });
});

describe('cookLogSummary', () => {
  it('pluralises and drops the branch part at 0', () => {
    expect(cookLogSummary([makeCook()])).toBe('1 cook · 1 recipe');
    expect(cookLogSummary([makeCook({ branchId: 'x' })])).toBe('1 cook · 1 recipe · 1 branch grew from a note');
    const many = [
      makeCook({ recipeId: 'r1', branchId: 'x' }),
      makeCook({ recipeId: 'r2', branchId: 'y' }),
      makeCook({ recipeId: 'r2' }),
    ];
    expect(cookLogSummary(many)).toBe('3 cooks · 2 recipes · 2 branches grew from notes');
  });
});

describe('cookTag', () => {
  it('prefers branched, else the vote', () => {
    expect(cookTag(makeCook({ branchId: 'b', vote: 'tweak' }))).toBe('branched');
    expect(cookTag(makeCook({ vote: 'again' }))).toBe('again');
    expect(cookTag(makeCook({ vote: 'tweak' }))).toBe('tweak');
    expect(COOK_TAGS.branched).toEqual({ label: 'Branched', icon: 'GitBranch' });
    expect(COOK_TAGS.again).toEqual({ label: 'Again', icon: 'Repeat' });
    expect(COOK_TAGS.tweak).toEqual({ label: 'Tweak', icon: 'Wrench' });
  });
});

// Local dates throughout, so the result does not depend on the machine's timezone.
// 2026-10-21 is a Wednesday.
const now = new Date(2026, 9, 21, 12, 0).getTime();
const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0).getTime();

describe('cookWhen', () => {
  it('names the weekday within 6 days', () => {
    expect(cookWhen(at(21, 0), now)).toBe('Wednesday');
    expect(cookWhen(at(18), now)).toBe('Sunday');
    expect(cookWhen(at(15, 23), now)).toBe('Thursday');
  });
  it('says Last week for 7 to 13 days', () => {
    expect(cookWhen(at(14), now)).toBe('Last week');
    expect(cookWhen(at(8, 0), now)).toBe('Last week');
  });
  it('uses the date from 14 days', () => {
    expect(cookWhen(at(7), now)).toBe('7 Oct');
    expect(cookWhen(new Date(2026, 8, 12).getTime(), now)).toBe('12 Sep');
  });
  it('combines with the vote', () => {
    expect(cookWhenLine({ createdAt: at(18), vote: 'again' }, now)).toBe('Sunday · would make again');
    expect(cookWhenLine({ createdAt: at(18), vote: 'tweak' }, now)).toBe('Sunday · needs a tweak');
  });
});

describe('noteToBranchPrompt', () => {
  it('returns null for empty', () => {
    expect(noteToBranchPrompt('')).toBeNull();
    expect(noteToBranchPrompt('  \n ')).toBeNull();
  });
  it('trims and collapses whitespace', () => {
    expect(noteToBranchPrompt('  less \n  salt  ')).toBe('less salt');
  });
  it('cuts at 200 on a word boundary', () => {
    const exact = 'a'.repeat(200);
    expect(noteToBranchPrompt(exact)).toBe(exact);
    const words = Array(60).fill('word').join(' ');
    const out = noteToBranchPrompt(words)!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('word')).toBe(true);
    expect(words.startsWith(out)).toBe(true);
    expect(noteToBranchPrompt('a'.repeat(199) + ' bbb')).toBe('a'.repeat(199));
    expect(noteToBranchPrompt('a'.repeat(250))).toBe('a'.repeat(200));
  });
});
