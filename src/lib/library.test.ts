import { describe, it, expect } from 'vitest';
import { buildFeed, branchingThisWeek, filterFeed, splitLibrary, normalizeTags, buildSavedList, searchLibrary, SEARCH_FILTERS, type FavoriteFetch } from './library';
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

describe('buildSavedList', () => {
  const other = { uid: 'chef', displayName: 'Ann' };
  const fav = (recipeId: string, createdAt: number) => ({ recipeId, createdAt });
  const none = new Map<string, FavoriteFetch>();
  const savedOf = (recipes: ReturnType<typeof makeRecipe>[]) =>
    splitLibrary(recipes, recipes, { uid: 'me', isConfigured: true }).saved;

  it('uses the device row for a local favourite and never fetches it', () => {
    const r = makeRecipe({ id: 'a', createdBy: other, parentId: 'p', rootId: 'p', depth: 1 });
    const out = buildSavedList([r], savedOf([r]), [fav('a', 5)], none, 'me');
    expect(out.rows.map((x) => x.id)).toEqual(['a']);
    expect(out.toFetch).toEqual([]);
  });

  it('leaves out the user\'s own recipes from either source', () => {
    const mine = makeRecipe({ id: 'm', createdBy: { uid: 'me', displayName: 'Me' } });
    const remote = makeRecipe({ id: 'r', createdBy: { uid: 'me', displayName: 'Me' } });
    const fetched = new Map<string, FavoriteFetch>([['r', { status: 'recipe', recipe: remote }]]);
    const out = buildSavedList([mine], [], [fav('m', 1), fav('r', 2)], fetched, 'me');
    expect(out.rows).toEqual([]);
  });

  it('includes favourited branches of other people\'s recipes', () => {
    const branch = makeRecipe({ id: 'b', createdBy: other, parentId: 'p', rootId: 'p', depth: 1 });
    const fetched = new Map<string, FavoriteFetch>([['b', { status: 'recipe', recipe: branch }]]);
    expect(buildSavedList([], [], [fav('b', 1)], fetched, 'me').rows.map((x) => x.id)).toEqual(['b']);
  });

  it('lists a recipe both saved and favourited once', () => {
    const r = makeRecipe({ id: 'a', createdBy: other });
    const out = buildSavedList([r], savedOf([r]), [fav('a', 5)], none, 'me');
    expect(out.rows).toHaveLength(1);
  });

  it('orders newest first by favourite date for favourites and recipe date for saved copies', () => {
    const s1 = makeRecipe({ id: 's1', createdBy: other, createdAt: 100 });
    const s2 = makeRecipe({ id: 's2', createdBy: other, createdAt: 300 });
    const f = makeRecipe({ id: 'f', createdBy: other, createdAt: 1 });
    const fetched = new Map<string, FavoriteFetch>([['f', { status: 'recipe', recipe: f }]]);
    const out = buildSavedList([s1, s2], savedOf([s1, s2]), [fav('f', 200)], fetched, 'me');
    expect(out.rows.map((x) => x.id)).toEqual(['s2', 'f', 's1']);
  });

  it('counts missing and failed reads, reports unfetched ids, and keeps all three out of rows', () => {
    const fetched = new Map<string, FavoriteFetch>([
      ['gone', { status: 'missing' }],
      ['bad', { status: 'failed' }],
    ]);
    const out = buildSavedList([], [], [fav('gone', 1), fav('bad', 2), fav('new', 3)], fetched, 'me');
    expect(out).toEqual({ rows: [], toFetch: ['new'], deletedCount: 1, failedCount: 1 });
  });
});

describe('searchLibrary', () => {
  const root = makeRecipe({
    id: 'r', title: 'Lemon Pasta', description: 'Bright.', totalTime: 20, difficulty: 'easy', createdAt: 1,
    ingredients: [makeIngredient('Spaghetti'), makeIngredient('Parsley')],
  });
  const branch = {
    ...makeRecipe({
      id: 'b', title: 'Vegan Pasta', description: 'Dairy free.', totalTime: 50, difficulty: 'hard', createdAt: 5,
      parentId: 'r', rootId: 'r', depth: 1, ingredients: [makeIngredient('Cashews')],
    }),
    prompt: 'make it vegan',
  };
  const all = [root, branch];
  const ids = (q: string, filter: 'all' | 'under30' | 'easy' | 'branches' = 'all', src: Parameters<typeof searchLibrary>[0] = all) =>
    searchLibrary(src, { query: q, filter }).map((r) => r.id);

  it('lists the four filters in order', () => {
    expect(SEARCH_FILTERS.map((f) => f.label)).toEqual(['All', 'Under 30 min', 'Easy', 'Branches']);
  });

  it('matches titles and ingredients, case-insensitively, across originals and branches', () => {
    expect(ids('PASTA')).toEqual(['b', 'r']);
    expect(ids('cashews')).toEqual(['b']);
  });

  it('needs every word, each may hit a different field', () => {
    expect(ids('lemon spaghetti')).toEqual(['r']);
    expect(ids('lemon cashews')).toEqual([]);
  });

  it('falls back to the whole query when every word is short', () => {
    const ox = makeRecipe({ id: 'ox', title: 'Ox tail' });
    expect(ids('ox', 'all', [ox])).toEqual(['ox']);
  });

  it('lists roots only for an empty query, branches only under Branches', () => {
    expect(ids('')).toEqual(['r']);
    expect(ids('  ', 'branches')).toEqual(['b']);
  });

  it('applies the under30 and easy filters', () => {
    expect(ids('pasta', 'under30')).toEqual(['r']);
    expect(ids('pasta', 'easy')).toEqual(['r']);
    expect(ids('pasta', 'branches')).toEqual(['b']);
  });

  it('keeps the first of duplicate ids', () => {
    const dup = makeRecipe({ id: 'r', title: 'Lemon Other' });
    const out = searchLibrary([root, dup], { query: 'lemon', filter: 'all' });
    expect(out.map((r) => r.title)).toEqual(['Lemon Pasta']);
  });

  it('labels branches with their family, or Variation when the root is absent', () => {
    const out = searchLibrary(all, { query: 'pasta', filter: 'all' });
    expect(out.map((r) => r.familyLabel)).toEqual(['Lemon Pasta variation', null]);
    expect(searchLibrary([branch], { query: 'pasta', filter: 'all' })[0].familyLabel).toBe('Variation');
  });

  it('uses the quoted prompt for a branch and the description otherwise', () => {
    const out = searchLibrary(all, { query: 'pasta', filter: 'all' });
    expect(out.map((r) => r.line)).toEqual(['"make it vegan"', 'Bright.']);
    const noPrompt = { ...branch, prompt: undefined };
    expect(searchLibrary([noPrompt], { query: 'pasta', filter: 'all' })[0].line).toBe('Dairy free.');
  });

  it('counts descendants over all sources and sorts newest first', () => {
    const out = searchLibrary(all, { query: 'pasta', filter: 'all' });
    expect(out.map((r) => r.id)).toEqual(['b', 'r']);
    expect(out[1].childCount).toBe(1);
  });
});

describe('branchingThisWeek', () => {
  const NOW = 1_000_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;
  const b = (id: string, rootId: string, ago: number, parentId: string | null = rootId) => ({ id, rootId, parentId, createdAt: NOW - ago });

  it('groups branches by root across depths and ignores originals', () => {
    const out = branchingThisWeek([b('a', 'r1', 1), b('b', 'r1', 2, 'a'), b('c', 'r2', 3), b('r3', 'r3', 0, null)], NOW);
    expect(out).toEqual([
      { rootId: 'r1', weekCount: 2, newestAt: NOW - 1 },
      { rootId: 'r2', weekCount: 1, newestAt: NOW - 3 },
    ]);
  });

  it('counts exactly 7 days in and one millisecond out', () => {
    expect(branchingThisWeek([b('a', 'r1', 7 * DAY)], NOW)).toHaveLength(1);
    expect(branchingThisWeek([b('a', 'r1', 7 * DAY + 1)], NOW)).toEqual([]);
  });

  it('falls back to id when rootId is absent', () => {
    expect(branchingThisWeek([{ id: 'x', parentId: 'p', createdAt: NOW }], NOW)[0].rootId).toBe('x');
  });

  it('sorts by count, then the newest branch', () => {
    const out = branchingThisWeek([b('a', 'r1', 5), b('b', 'r2', 1), b('c', 'r3', 9), b('d', 'r3', 8)], NOW);
    expect(out.map((f) => f.rootId)).toEqual(['r3', 'r2', 'r1']);
  });

  it('cuts to max and handles empty input', () => {
    const many = Array.from({ length: 12 }, (_, i) => b(`k${i}`, `r${i}`, i));
    expect(branchingThisWeek(many, NOW)).toHaveLength(8);
    expect(branchingThisWeek(many, NOW, 3)).toHaveLength(3);
    expect(branchingThisWeek([], NOW)).toEqual([]);
  });
});
