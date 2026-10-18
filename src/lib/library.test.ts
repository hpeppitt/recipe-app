import { describe, it, expect } from 'vitest';
import { buildFeed, filterFeed, splitLibrary, normalizeTags, parseLibraryTab } from './library';
import { makeRecipe, makeIngredient } from '../test/factories';

describe('normalizeTags', () => {
  it('trims, lower-cases, drops empties and de-duplicates in first-seen order', () => {
    expect(normalizeTags(['Italian', ' italian ', '', 'Quick'])).toEqual(['italian', 'quick']);
  });

  it('lower-cases mixed case', () => {
    expect(normalizeTags(['GlUtEn-Free'])).toEqual(['gluten-free']);
  });

  it('trims surrounding whitespace and drops whitespace-only tags', () => {
    expect(normalizeTags(['  vegan\t', '   '])).toEqual(['vegan']);
  });

  it('keeps first-seen order across case-only duplicates', () => {
    expect(normalizeTags(['Quick', 'Dinner', 'QUICK', 'dinner'])).toEqual(['quick', 'dinner']);
  });

  it('returns [] for a missing array', () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe('parseLibraryTab', () => {
  it('restores Explore', () => {
    expect(parseLibraryTab('explore')).toBe('explore');
  });

  it.each([null, undefined, '', 'mine', 'Explore', 'garbage'])(
    'defaults %s to My Recipes',
    (raw) => {
      expect(parseLibraryTab(raw)).toBe('mine');
    }
  );
});

describe('buildFeed', () => {
  it('lists roots only, newest first', () => {
    const old = makeRecipe({ id: 'old', createdAt: 1 });
    const recent = makeRecipe({ id: 'new', createdAt: 5 });
    const child = makeRecipe({ id: 'child', parentId: 'old', rootId: 'old', depth: 1, createdAt: 9 });
    const feed = buildFeed([old, recent, child], [old, recent, child]);
    expect(feed.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('dedups by id, keeping the first occurrence', () => {
    const first = makeRecipe({ id: 'same', title: 'First' });
    const second = makeRecipe({ id: 'same', title: 'Second' });
    const feed = buildFeed([first, second], []);
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toBe('First');
  });

  it('counts variations across both stores', () => {
    const root = makeRecipe({ id: 'root' });
    const localChild = makeRecipe({ id: 'l', parentId: 'root', rootId: 'root' });
    // A cloud record with no rootId counts as its own root, as the merge did.
    const cloudChild = { ...makeRecipe({ id: 'c', parentId: 'root' }), rootId: 'root' };
    const feed = buildFeed([root], [root, localChild, cloudChild]);
    expect(feed[0].childCount).toBe(2);
  });

  it('defaults fields a published record may lack', () => {
    const { ingredients: _i, ...bare } = makeRecipe({ id: 'p' });
    const feed = buildFeed(
      [{ ...bare, rootId: undefined, depth: undefined, createdAt: undefined, parentId: undefined }],
      []
    );
    expect(feed[0]).toMatchObject({ rootId: 'p', depth: 0, createdAt: 0, parentId: null, ingredients: [], childCount: 0 });
  });

  it('returns an empty feed for empty input', () => {
    expect(buildFeed([], [])).toEqual([]);
  });
});

describe('filterFeed', () => {
  const pasta = makeRecipe({ id: 'pasta', title: 'Pasta', createdBy: { uid: 'me', displayName: null } });
  const curry = makeRecipe({
    id: 'curry',
    title: 'Curry',
    ingredients: [makeIngredient('chicken')],
    createdBy: { uid: 'chef', displayName: 'Chef' },
  });
  const salad = makeRecipe({ id: 'salad', title: 'Salad', createdBy: { uid: 'other', displayName: null } });
  const feed = [pasta, curry, salad];

  it('returns everything with no filter', () => {
    expect(filterFeed(feed, {})).toEqual(feed);
  });

  it('searches titles and ingredient names, case-insensitively', () => {
    expect(filterFeed(feed, { search: 'PASTA' }).map((r) => r.id)).toEqual(['pasta']);
    expect(filterFeed(feed, { search: 'chicken' }).map((r) => r.id)).toEqual(['curry']);
  });

  it('treats a whitespace-only search as no search', () => {
    expect(filterFeed(feed, { search: '   ' })).toHaveLength(3);
  });

  it('keeps favourites only', () => {
    expect(filterFeed(feed, { favoriteIds: new Set(['salad']) }).map((r) => r.id)).toEqual(['salad']);
  });

  it('an empty favourites set empties the list', () => {
    expect(filterFeed(feed, { favoriteIds: new Set() })).toEqual([]);
  });

  it('keeps followed creators only', () => {
    expect(filterFeed(feed, { followingIds: new Set(['chef']) }).map((r) => r.id)).toEqual(['curry']);
  });

  it('combines search with favourites and following', () => {
    const favs = new Set(['pasta', 'curry']);
    expect(filterFeed(feed, { favoriteIds: favs, search: 'curry' }).map((r) => r.id)).toEqual(['curry']);
    expect(filterFeed(feed, { followingIds: new Set(['chef']), search: 'pasta' })).toEqual([]);
  });

  it('returns an empty list for an empty feed', () => {
    expect(filterFeed([], { search: 'x', favoriteIds: new Set(['a']) })).toEqual([]);
  });
});

describe('splitLibrary', () => {
  const me = { uid: 'me', displayName: null };
  const them = { uid: 'them', displayName: null };
  const cfg = { uid: 'me', isConfigured: true };
  const ids = (l: { id: string }[]) => l.map((r) => r.id);

  const myRoot = makeRecipe({ id: 'my-root', createdBy: me, createdAt: 10 });
  const myChild = makeRecipe({ id: 'my-child', parentId: 'my-root', rootId: 'my-root', depth: 1, createdBy: me, createdAt: 20 });
  const theirRoot = makeRecipe({ id: 'their-root', createdBy: them, createdAt: 30 });
  const myBranchOfTheirs = makeRecipe({ id: 'my-branch', parentId: 'their-root', rootId: 'their-root', depth: 1, createdBy: me, createdAt: 40 });
  const theirChild = makeRecipe({ id: 'their-child', parentId: 'their-root', rootId: 'their-root', depth: 1, createdBy: them, createdAt: 50 });
  const localRow = makeRecipe({ id: 'pre-auth', createdAt: 5 });
  const all = [myRoot, myChild, theirRoot, myBranchOfTheirs, theirChild, localRow];

  it('sorts own roots, own variations and saved copies, newest first', () => {
    const r = splitLibrary(all, all, cfg);
    expect(ids(r.created)).toEqual(['my-root']);
    expect(ids(r.branched)).toEqual(['my-branch', 'my-child']);
    expect(ids(r.saved)).toEqual(['their-root', 'pre-auth']);
  });

  it('never puts another user row in created or branched', () => {
    const r = splitLibrary(all, all, cfg);
    for (const row of [...r.created, ...r.branched]) expect(row.createdBy.uid).toBe('me');
  });

  it('puts local rows in saved when configured', () => {
    expect(ids(splitLibrary([localRow], [localRow], cfg).saved)).toEqual(['pre-auth']);
  });

  it('puts every root in created and every variation in branched when unconfigured', () => {
    const r = splitLibrary(all, all, { uid: undefined, isConfigured: false });
    expect(ids(r.created)).toEqual(['their-root', 'my-root', 'pre-auth']);
    expect(ids(r.branched)).toEqual(['their-child', 'my-branch', 'my-child']);
    expect(r.saved).toEqual([]);
  });

  it('claims nothing when signed out', () => {
    const r = splitLibrary(all, all, { uid: undefined, isConfigured: true });
    expect(r.created).toEqual([]);
    expect(r.branched).toEqual([]);
    expect(ids(r.saved)).toEqual(['their-root', 'my-root', 'pre-auth']);
  });

  it('deduplicates by id and counts children from countFrom', () => {
    const r = splitLibrary([myRoot, myRoot], all, cfg);
    expect(r.created).toHaveLength(1);
    expect(r.created[0].childCount).toBe(1);
  });
});
