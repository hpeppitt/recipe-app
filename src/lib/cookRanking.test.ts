import { describe, it, expect } from 'vitest';
import { cookedThisWeek, familyLeader, mostCooked, parseRecentCooksCache, type RecentCook } from './cookRanking';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const cook = (recipeId: string, rootId: string, daysAgo: number, uid = 'u'): RecentCook => ({ recipeId, rootId, uid, createdAt: NOW - daysAgo * DAY });
const many = (n: number, recipeId: string, rootId: string, daysAgo = 1) => Array.from({ length: n }, (_, i) => cook(recipeId, rootId, daysAgo, `u${i}`));

describe('cookedThisWeek', () => {
  it('counts the last 7 days only; exactly 7 days old is out', () => {
    const out = cookedThisWeek([cook('a', 'a', 6.9), cook('b', 'b', 7), cook('c', 'c', 8)], NOW);
    expect(out.map((r) => r.recipeId)).toEqual(['a']);
  });
  it('ranks by count, breaks ties by newest cook, caps uids at 3 distinct and rows at 8', () => {
    const cooks = [...many(5, 'a', 'r'), cook('b', 'r', 1), cook('b', 'r', 2), cook('c', 'r', 0.5), cook('c', 'r', 3), cook('a', 'r', 1, 'u0')];
    const out = cookedThisWeek(cooks, NOW);
    expect(out.map((r) => r.recipeId)).toEqual(['a', 'c', 'b']);
    expect(out[0]).toMatchObject({ count: 5, rootId: 'r' });
    expect(out[0].uids).toEqual(['u0', 'u1', 'u2']);
    const nine = Array.from({ length: 9 }, (_, i) => cook(`x${i}`, 'r', 1));
    expect(cookedThisWeek(nine, NOW)).toHaveLength(8);
  });
  it('ignores cooks dated in the future', () => {
    expect(cookedThisWeek([cook('a', 'a', -1)], NOW)).toEqual([]);
  });
});

describe('mostCooked', () => {
  it('ranks families over the window with the top version, top 3', () => {
    const cooks = [...many(2, 'f1', 'A', 2), ...many(3, 'f2', 'A', 3), cook('o', 'A', 4), ...many(4, 'z', 'B', 5), ...many(1, 'q', 'C'), ...many(1, 'w', 'D')];
    const out = mostCooked(cooks, NOW, 30);
    expect(out).toEqual([
      { rootId: 'A', count: 4, topRecipeId: 'f2' },
      { rootId: 'B', count: 4, topRecipeId: 'z' },
      { rootId: 'C', count: 1, topRecipeId: 'q' },
    ]);
  });
  it('30 and 90 day windows differ, and ties fall to id order', () => {
    const cooks = [cook('a', 'A', 40), cook('b', 'B', 40), cook('c', 'C', 10)];
    expect(mostCooked(cooks, NOW, 30).map((r) => r.rootId)).toEqual(['C']);
    expect(mostCooked(cooks, NOW, 90).map((r) => r.rootId)).toEqual(['A', 'B', 'C']);
  });
});

describe('familyLeader', () => {
  it('needs 3x the original and at least 3 cooks', () => {
    expect(familyLeader([...many(3, 'v', 'r'), cook('r', 'r', 1)], 'other', NOW)).toBe(null);
    expect(familyLeader([...many(3, 'v', 'r'), cook('r', 'r', 1)], 'r', NOW)).toBe('v');
    expect(familyLeader([...many(3, 'v', 'r'), ...many(2, 'r', 'r')], 'r', NOW)).toBe(null);
    expect(familyLeader(many(2, 'v', 'r'), 'r', NOW)).toBe(null);
  });
  it('a version with 3 cooks beats an original with none; the root itself never leads', () => {
    expect(familyLeader(many(3, 'v', 'r'), 'r', NOW)).toBe('v');
    expect(familyLeader(many(9, 'r', 'r'), 'r', NOW)).toBe(null);
  });
  it('ignores cooks older than 90 days and other families', () => {
    expect(familyLeader([...many(3, 'v', 'r', 91), ...many(3, 'w', 'other')], 'r', NOW)).toBe(null);
  });
});

describe('distinct people', () => {
  it('one person cooking many times counts once', () => {
    const rep = Array.from({ length: 5 }, () => cook('v', 'r', 1, 'same'));
    expect(familyLeader(rep, 'r', NOW)).toBeNull();
    expect(cookedThisWeek(rep, NOW)[0].count).toBe(1);
    expect(mostCooked(rep, NOW, 30)[0].count).toBe(1);
  });
});

describe('parseRecentCooksCache', () => {
  const ttl = 6 * 3600_000;
  const good = [cook('a', 'a', 1)];
  it('accepts a fresh entry and rejects old, future, or malformed ones', () => {
    expect(parseRecentCooksCache({ at: NOW - 1000, cooks: good }, NOW, ttl)).toEqual(good);
    expect(parseRecentCooksCache({ at: NOW - ttl, cooks: good }, NOW, ttl)).toBeNull();
    expect(parseRecentCooksCache({ at: NOW + 1, cooks: good }, NOW, ttl)).toBeNull();
    expect(parseRecentCooksCache({ at: NOW, cooks: [{ recipeId: 'a' }] }, NOW, ttl)).toBeNull();
    expect(parseRecentCooksCache({ at: NOW, cooks: null }, NOW, ttl)).toBeNull();
    expect(parseRecentCooksCache('x', NOW, ttl)).toBeNull();
    expect(parseRecentCooksCache(null, NOW, ttl)).toBeNull();
  });
});

describe('spare candidates (RL-243)', () => {
  it('a larger max returns more for backfill; the defaults are unchanged', () => {
    const cooks = Array.from({ length: 12 }, (_, i) => cook(`r${i}`, `r${i}`, 1));
    expect(cookedThisWeek(cooks, NOW)).toHaveLength(8);
    expect(cookedThisWeek(cooks, NOW, 10)).toHaveLength(10);
    expect(mostCooked(cooks, NOW, 30)).toHaveLength(3);
    expect(mostCooked(cooks, NOW, 30, 5)).toHaveLength(5);
  });
});
