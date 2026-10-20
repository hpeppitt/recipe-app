import { describe, expect, it } from 'vitest';
import { makeRecipe } from '../test/factories';
import { forestHeadline, forestSummary, layoutForestFamily } from './forest';

const by = (uid: string) => ({ uid, displayName: null });

describe('layoutForestFamily', () => {
  it('centres a one-node family', () => {
    const root = makeRecipe({ id: 'r', createdBy: by('me') });
    const f = layoutForestFamily([root], 'me');
    expect(f.dots).toEqual([{ id: 'r', x: 70, y: 37, r: 7, mine: true }]);
    expect(f.path).toBe('');
    expect(f).toMatchObject({ planted: true, grewCount: 0, target: 'r' });
  });

  it('lays a chain out by parent depth, ignoring stored depth', () => {
    const a = makeRecipe({ id: 'a', createdAt: 1 });
    const b = makeRecipe({ id: 'b', parentId: 'a', depth: 9, createdAt: 2 });
    const c = makeRecipe({ id: 'c', parentId: 'b', depth: 9, createdAt: 3 });
    const f = layoutForestFamily([c, b, a], 'x');
    expect(f.dots.map((d) => [d.x, d.y, d.r])).toEqual([[14, 37, 7], [70, 37, 5], [126, 37, 5]]);
    expect(f.path).toBe('M14 37 C32 37 52 37 70 37 M70 37 C88 37 108 37 126 37');
  });

  it('spreads a wide family evenly', () => {
    const root = makeRecipe({ id: 'r', createdAt: 1 });
    const kids = [2, 3, 4].map((n) => makeRecipe({ id: `k${n}`, parentId: 'r', createdAt: n }));
    const f = layoutForestFamily([root, ...kids], 'x');
    expect(f.dots.slice(1).map((d) => d.y)).toEqual([18.5, 37, 55.5]);
    expect(f.dots.slice(1).every((d) => d.x === 126)).toBe(true);
  });

  it('marks mixed owners and picks the target', () => {
    const root = makeRecipe({ id: 'r', createdAt: 1, createdBy: by('o') });
    const m1 = makeRecipe({ id: 'm1', parentId: 'r', createdAt: 3, createdBy: by('me') });
    const m2 = makeRecipe({ id: 'm2', parentId: 'r', createdAt: 2, createdBy: by('me') });
    const f = layoutForestFamily([root, m1, m2], 'me');
    expect(f).toMatchObject({ planted: false, grewCount: 2, target: 'm2' });
    expect(f.dots.map((d) => d.mine)).toEqual([false, true, true]);
    const owner = layoutForestFamily([root, m1, m2], 'o');
    expect(owner).toMatchObject({ planted: true, grewCount: 0, target: 'r' });
  });

  it('draws only the first 40 by createdAt but counts everything', () => {
    const root = makeRecipe({ id: 'r', createdAt: 1, createdBy: by('me') });
    const kids = Array.from({ length: 50 }, (_, i) => makeRecipe({ id: `k${i}`, parentId: 'r', createdAt: 10 + i, createdBy: by('me') }));
    const f = layoutForestFamily([root, ...kids], 'me');
    expect(f.dots).toHaveLength(40);
    expect(f.grewCount).toBe(50);
  });
});

describe('forestSummary', () => {
  it('counts planted families and all branches under them', () => {
    const mine = [makeRecipe({ id: 'a', createdBy: by('me') }), makeRecipe({ id: 'b', parentId: 'a', createdBy: by('o') })];
    const theirs = [makeRecipe({ id: 'c', createdBy: by('o') }), makeRecipe({ id: 'd', parentId: 'c', createdBy: by('me') })];
    expect(forestSummary([mine, theirs], 'me')).toEqual({ planted: 1, grown: 1 });
  });
});

describe('forestHeadline', () => {
  it.each([
    [12, 31, 'Planted 12 recipes. 31 branches have grown from them.'],
    [1, 1, 'Planted 1 recipe. 1 branch has grown from it.'],
    [1, 4, 'Planted 1 recipe. 4 branches have grown from it.'],
    [3, 1, 'Planted 3 recipes. 1 branch has grown from them.'],
    [0, 0, 'Planted 0 recipes. 0 branches have grown from them.'],
  ])('%i/%i', (p, g, s) => expect(forestHeadline(p, g)).toBe(s));
});
