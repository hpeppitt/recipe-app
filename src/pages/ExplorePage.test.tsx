// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act, within } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { db } from '../db/database';
import { EXPLORE_TAGS } from '../lib/constants';
import type { AppUser, Recipe } from '../types/recipe';

const getPage = vi.fn();
const getRecent = vi.fn();
const getOne = vi.fn();
vi.mock('../services/firestore', () => ({
  getPublishedRecipesPage: (...a: unknown[]) => getPage(...a),
  getRecentPublishedRecipes: (...a: unknown[]) => getRecent(...a),
  getPublishedRecipe: (...a: unknown[]) => getOne(...a),
  getRecipesByUsers: vi.fn(async () => []),
  getCloudFavorites: vi.fn(async () => []),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../hooks/useFollow', () => ({
  useFollowingList: () => ({
    followingIds: ['chef'],
    followingProfiles: [{ uid: 'chef', displayName: 'Chef', photoType: 'generated' }],
    isLoading: false,
  }),
}));

import { ExplorePage } from './ExplorePage';
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { clearBranchingThisWeekCache } from '../hooks/useBranchingThisWeek';

const anon: AppUser = { uid: 'anon-1', displayName: 'CrispyWaffle', email: null, isAnonymous: true, emailVerified: false };
const cloud = (over: Partial<Recipe> = {}) => ({ ...makeRecipe(over), favoriteCount: 0, viewCount: 0 });
const localOnly = { auth: { isConfigured: false } } as const;

beforeEach(async () => {
  await db.recipes.clear();
  await db.favorites.clear();
  getPage.mockReset();
  getRecent.mockReset();
  getRecent.mockResolvedValue([]);
  getOne.mockReset();
  clearBranchingThisWeekCache();
  getPage.mockResolvedValue({ recipes: [], cursor: null, hasMore: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ExplorePage header', () => {
  it('shows the day-part kicker and the What\'s growing heading', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 18, 30)); // a Tuesday evening
    renderWithProviders(<ExplorePage />);
    expect(screen.getByText('Tuesday evening')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: "What's growing" })).toBeInTheDocument();
  });

  it('has no bell, profile or settings buttons and no library tabs (the nav has them)', () => {
    renderWithProviders(<ExplorePage />);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'My Recipes' })).not.toBeInTheDocument();
  });
});

describe('ExplorePage search', () => {
  it('the Search button is a link to /search', () => {
    renderWithProviders(<ExplorePage />);
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});

describe('ExplorePage beside a recipe (RL-116)', () => {
  it('demotes its heading to h2 and marks the open recipe current', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ id: 'r1', title: 'Soup' }), cloud({ id: 'r2', title: 'Stew' })], cursor: null, hasMore: false });
    renderWithProviders(
      <RecipePaneContext.Provider value="r1">
        <ExplorePage />
      </RecipePaneContext.Provider>
    );
    expect(await screen.findByRole('link', { name: 'Soup' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Stew' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 2, name: "What's growing" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('marks nothing current without a pane', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ id: 'r1', title: 'Soup' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('link', { name: 'Soup' })).not.toHaveAttribute('aria-current');
  });
});

describe('ExplorePage rows', () => {
  it('makes each row one link named by the title, with the author pill as a separate link', async () => {
    const root = cloud({ id: 'r1', title: 'Cloud Curry', createdBy: { uid: 'ana', displayName: 'Ana' } });
    const child = cloud({ id: 'c1', parentId: 'r1', rootId: 'r1', depth: 1, title: 'Child' });
    getPage.mockResolvedValue({ recipes: [root, child], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    const row = await screen.findByRole('link', { name: 'Cloud Curry' });
    expect(row).toHaveAttribute('href', '/recipe/r1');
    // Variations are not listed, only counted.
    expect(screen.queryByRole('link', { name: 'Child' })).not.toBeInTheDocument();

    const author = screen.getByRole('link', { name: "View Ana's profile" });
    expect(author).toHaveAttribute('href', '/profile/ana');
    expect(row.contains(author)).toBe(false);
    expect(author.closest('a[href^="/recipe/"]')).toBeNull();
    // The 44px target is the link's own padding; overflow on the link would clip any
    // extension, so clipping lives on the inner span (jsdom has no layout, so check classes).
    expect(author.className.split(' ')).toEqual(expect.arrayContaining(['relative', 'z-10', 'py-3', '-my-3']));
    expect(author.className).not.toMatch(/(^| )(truncate|overflow-hidden)( |$)/);
    expect(author.firstElementChild).toHaveClass('min-w-0', 'overflow-hidden');

    const item = row.closest('li')!;
    const badge = within(item).getByText(
      (_, el) => el?.tagName === 'SPAN' && el.textContent?.replace(/\s+/g, ' ').trim() === '1 branch'
    );
    expect(badge).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Recipes' })).toBeInTheDocument();
  });

  it('shows no branch count on a recipe with no branches', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ title: 'Lonely Soup' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    const item = (await screen.findByRole('link', { name: 'Lonely Soup' })).closest('li')!;
    expect(within(item).queryByText(/branch/)).not.toBeInTheDocument();
  });

  it('falls back to Untitled recipe and Anonymous for blank data', async () => {
    getPage.mockResolvedValue({
      recipes: [cloud({ title: '  ', createdBy: { uid: 'x', displayName: null } })],
      cursor: null,
      hasMore: false,
    });
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('link', { name: 'Untitled recipe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "View Anonymous's profile" })).toBeInTheDocument();
  });

  it('marks a favourited row', async () => {
    getPage.mockResolvedValue({
      recipes: [cloud({ id: 'fav', title: 'Loved Stew' }), cloud({ id: 'other', title: 'Plain Stew' })],
      cursor: null,
      hasMore: false,
    });
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'fav', createdAt: 1 });
    renderWithProviders(<ExplorePage />);
    const loved = (await screen.findByRole('link', { name: 'Loved Stew' })).closest('li')!;
    expect(await within(loved).findByText('Saved')).toBeInTheDocument();
    const plain = screen.getByRole('link', { name: 'Plain Stew' }).closest('li')!;
    expect(within(plain).queryByText('Saved')).not.toBeInTheDocument();
  });
});

describe('ExplorePage feed', () => {
  it('reads the shared feed on first render and shows its empty state', async () => {
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByText('Nothing published yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a recipe' })).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it('lists published recipes', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ title: 'Cloud Curry' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('link', { name: 'Cloud Curry' })).toBeInTheDocument();
  });

  it('shows the list skeleton while loading', () => {
    getPage.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ExplorePage />);
    expect(screen.getByRole('status', { name: 'Loading recipes' })).toBeInTheDocument();
  });

  it('offers Following to verified accounts', async () => {
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  it('hides Following from an anonymous account', async () => {
    renderWithProviders(<ExplorePage />, { user: anon });
    await screen.findByText('Nothing published yet');
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
  });

  it('has no Favourites chip for a verified user with favourites (RL-127)', async () => {
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'fav', createdAt: 1 });
    getPage.mockResolvedValue({ recipes: [cloud({ id: 'fav', title: 'Loved Stew' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    await screen.findByRole('link', { name: 'Loved Stew' });
    expect(screen.queryByRole('button', { name: /favou?rites/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  it('says when Load more fails, keeps the list, and clears on a successful retry', async () => {
    getPage
      .mockResolvedValueOnce({ recipes: [cloud({ title: 'Page One' })], cursor: {}, hasMore: true })
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce({ recipes: [cloud({ title: 'Page Two' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    await screen.findByRole('link', { name: 'Page One' });

    fireEvent.click(screen.getByRole('button', { name: 'Load more recipes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load more recipes. Try again.');
    expect(screen.getByRole('link', { name: 'Page One' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more recipes' }));
    expect(await screen.findByRole('link', { name: 'Page Two' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page One' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows Could not load with Try again when Explore fails', async () => {
    getPage.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    expect(screen.getByText('Could not load the shared library. Check your connection and try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing published yet')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledTimes(2);
  });

  it('uses the offline copy for the cloud error when offline on a fresh load', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    getPage.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<ExplorePage />);
    expect(
      await screen.findByText("You're offline. Explore needs a connection; your own and saved recipes still work on this device.")
    ).toBeInTheDocument();
    expect(screen.queryByText("You're offline. Showing what was loaded before.")).not.toBeInTheDocument();
  });

  it('shows the offline banner over rows loaded before, and drops it back online', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ title: 'Cloud Curry' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    await screen.findByRole('link', { name: 'Cloud Curry' });
    const BANNER = "You're offline. Showing what was loaded before.";
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    vi.stubGlobal('navigator', { onLine: false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cloud Curry' })).toBeInTheDocument();
    vi.stubGlobal('navigator', { onLine: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });
});

describe('ExplorePage tile row', () => {
  const NOW = new Date(2026, 9, 20, 12, 0).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const page = (recipes: ReturnType<typeof cloud>[]) =>
    getPage.mockResolvedValue({ recipes, cursor: null, hasMore: false });
  const region = (name: string) => screen.queryByRole('region', { name });
  const tileLink = (title: string) => screen.queryByRole('link', { name: `Open ${title}` });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it('is a region named by its heading, between the header and the chips, with tiles in feed order', async () => {
    page([cloud({ id: 'a', title: 'Alpha', createdAt: NOW - DAY }), cloud({ id: 'b', title: 'Beta', createdAt: NOW - 2 * DAY })]);
    renderWithProviders(<ExplorePage />);
    const row = await screen.findByRole('region', { name: 'New this week' });
    expect(within(row).getByRole('heading', { level: 2, name: 'New this week' })).toBeInTheDocument();
    expect(
      within(row).getAllByRole('link').map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/recipe/'))
    ).toEqual(['/recipe/a', '/recipe/b']);
    const chips = screen.getByRole('button', { name: 'All' });
    expect(row.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is titled New this week at exactly 7 days and Newest one millisecond past it', async () => {
    page([cloud({ id: 'a', title: 'Alpha', createdAt: NOW }), cloud({ id: 'b', title: 'Beta', createdAt: NOW - 7 * DAY })]);
    const { unmount } = renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('region', { name: 'New this week' })).toBeInTheDocument();
    expect(region('Newest')).not.toBeInTheDocument();
    unmount();

    page([cloud({ id: 'a', title: 'Alpha', createdAt: NOW }), cloud({ id: 'b', title: 'Beta', createdAt: NOW - 7 * DAY - 1 })]);
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('region', { name: 'Newest' })).toBeInTheDocument();
    expect(region('New this week')).not.toBeInTheDocument();
  });

  it('shows only roots, at most 8, and leaves the list intact', async () => {
    const roots = Array.from({ length: 9 }, (_, i) => cloud({ id: `r${i}`, title: `Root ${i}`, createdAt: NOW - i * 1000 }));
    page([...roots, cloud({ id: 'kid', parentId: 'r0', rootId: 'r0', depth: 1, title: 'Kid', createdAt: NOW })]);
    renderWithProviders(<ExplorePage />);
    const row = await screen.findByRole('region', { name: 'New this week' });
    expect(within(row).getAllByRole('listitem')).toHaveLength(8);
    expect(tileLink('Root 7')).toBeInTheDocument();
    expect(tileLink('Root 8')).not.toBeInTheDocument();
    expect(tileLink('Kid')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Root 8' })).toBeInTheDocument();
  });

  it('hides under the Following filter', async () => {
    page([cloud({ id: 'a', title: 'Alpha', createdAt: NOW })]);
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('region', { name: 'New this week' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Following' }));
    await screen.findByText('No recipes from followed users');
    expect(region('New this week')).not.toBeInTheDocument();
    expect(region('Newest')).not.toBeInTheDocument();
  });

  it('hides under a tag', async () => {
    page([cloud({ id: 'a', title: 'Alpha', createdAt: NOW })]);
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('region', { name: 'New this week' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: EXPLORE_TAGS[0] }));
    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(region('New this week')).not.toBeInTheDocument();
    expect(region('Newest')).not.toBeInTheDocument();
  });

  it('is absent while loading, when the feed is empty, and on a load error', async () => {
    getPage.mockReturnValue(new Promise(() => {}));
    const first = renderWithProviders(<ExplorePage />);
    expect(screen.getByRole('status', { name: 'Loading recipes' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    first.unmount();

    page([]);
    const second = renderWithProviders(<ExplorePage />);
    await screen.findByText('Nothing published yet');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    second.unmount();

    getPage.mockRejectedValue(new Error('offline'));
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Could not load');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('is absent in local-only mode even with recipes', async () => {
    await db.recipes.add(makeRecipe({ id: 'l1', title: 'Local Loaf', createdAt: NOW }));
    renderWithProviders(<ExplorePage />, localOnly);
    expect(await screen.findByRole('link', { name: 'Local Loaf' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('ExplorePage Branching fast this week', () => {
  const NOW = Date.now();
  const kid = (id: string, rootId: string) => cloud({ id, rootId, parentId: rootId, depth: 1, title: id, createdAt: NOW - 1000 });
  const region = (name: string) => screen.queryByRole('region', { name });

  it('shows the row, busiest family first with a +N badge, instead of Newest', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ id: 'a', title: 'Alpha', createdAt: NOW }), cloud({ id: 'b', title: 'Beta', createdAt: NOW })], cursor: null, hasMore: false });
    getRecent.mockResolvedValue([kid('k1', 'b'), kid('k2', 'b'), kid('k3', 'a')]);
    renderWithProviders(<ExplorePage />);
    const row = await screen.findByRole('region', { name: 'Branching fast this week' });
    expect(within(row).getAllByRole('link', { name: /^Open / }).map((a) => a.textContent || a.getAttribute('aria-label'))).toEqual(['Open Beta', 'Open Alpha']);
    expect(within(row).getByText('2 new branches this week')).toBeInTheDocument();
    expect(within(row).getByText('+2 this week')).toBeInTheDocument();
    expect(region('New this week')).not.toBeInTheDocument();
  });

  it('shows a placeholder, no row, while the query is in flight, then falls back to Newest when it fails', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ id: 'a', title: 'Alpha', createdAt: NOW })], cursor: null, hasMore: false });
    let reject!: (e: Error) => void;
    const inFlight = new Promise((_, rj) => (reject = rj));
    inFlight.catch(() => {}); // mark handled: the hook may attach its handler after reject fires on a slow runner
    getRecent.mockReturnValue(inFlight);
    renderWithProviders(<ExplorePage />);
    await screen.findByRole('link', { name: 'Alpha' });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(document.querySelector('.h-\\[280px\\][aria-hidden="true"]')).toBeInTheDocument();
    await act(async () => reject(new Error('x')));
    expect(await screen.findByRole('region', { name: 'New this week' })).toBeInTheDocument();
    expect(document.querySelector('.h-\\[280px\\][aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('hides under a tag with a non-empty week', async () => {
    getPage.mockResolvedValue({ recipes: [cloud({ id: 'a', title: 'Alpha', createdAt: NOW })], cursor: null, hasMore: false });
    getRecent.mockResolvedValue([kid('k1', 'a')]);
    renderWithProviders(<ExplorePage />);
    expect(await screen.findByRole('region', { name: 'Branching fast this week' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: EXPLORE_TAGS[0] }));
    expect(region('Branching fast this week')).not.toBeInTheDocument();
  });

  it('is absent while the feed loads and when it fails, with a non-empty week', async () => {
    getRecent.mockResolvedValue([kid('k1', 'a')]);
    getPage.mockReturnValue(new Promise(() => {}));
    const first = renderWithProviders(<ExplorePage />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    first.unmount();
    getPage.mockRejectedValue(new Error('offline'));
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Could not load');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('makes no query in local-only mode', async () => {
    await db.recipes.add(makeRecipe({ id: 'l1', title: 'Local Loaf' }));
    renderWithProviders(<ExplorePage />, localOnly);
    await screen.findByRole('link', { name: 'Local Loaf' });
    expect(getRecent).not.toHaveBeenCalled();
  });
});

describe('ExplorePage local-only mode', () => {
  const NEVER = "You haven't created a recipe yet";

  it('lists the device\'s root recipes and reads nothing from the cloud', async () => {
    const root = makeRecipe({ id: 'l1', title: 'Local Lasagne' });
    await db.recipes.bulkAdd([root, makeRecipe({ parentId: 'l1', rootId: 'l1', depth: 1, title: 'Local Branch' })]);
    renderWithProviders(<ExplorePage />, localOnly);
    expect(await screen.findByRole('link', { name: 'Local Lasagne' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Local Branch' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: "What's growing" })).toBeInTheDocument();
    // Every row is the device's own, so no author link.
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/search', '/recipe/l1']);
    expect(getPage).not.toHaveBeenCalled();
  });

  it('offers no chip beyond All', async () => {
    renderWithProviders(<ExplorePage />, localOnly);
    await screen.findByText(NEVER);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by tag' })).not.toBeInTheDocument();
  });

  it('shows the never-created copy with no recipes', async () => {
    renderWithProviders(<ExplorePage />, localOnly);
    expect(await screen.findByText(NEVER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a recipe' })).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

});

describe('Explore tag chips', () => {
  it('renders the curated tags in the chips row', async () => {
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Nothing published yet');
    const group = screen.getByRole('group', { name: 'Filter by tag' });
    for (const t of EXPLORE_TAGS) expect(within(group).getByRole('button', { name: t })).toHaveAttribute('aria-pressed', 'false');
  });

  it('passes the tag to the query, resets paging, and clears on a second tap', async () => {
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Nothing published yet');
    expect(getPage).toHaveBeenLastCalledWith(null, undefined, null);

    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    expect(await screen.findByText('No recipes tagged vegan yet')).toBeInTheDocument();
    expect(getPage).toHaveBeenLastCalledWith(null, undefined, 'vegan');
    expect(screen.getByRole('button', { name: 'vegan' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'dessert' }));
    await screen.findByText('No recipes tagged dessert yet');
    expect(screen.getByRole('button', { name: 'vegan' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Clear tag' }));
    expect(await screen.findByText('Nothing published yet')).toBeInTheDocument();
    expect(getPage).toHaveBeenLastCalledWith(null, undefined, null);
  });

  it('a second tap on the active tag clears it', async () => {
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Nothing published yet');
    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    await screen.findByText('No recipes tagged vegan yet');
    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    expect(await screen.findByText('Nothing published yet')).toBeInTheDocument();
    expect(getPage).toHaveBeenLastCalledWith(null, undefined, null);
  });

  it('returns focus to the cleared chip, and the empty state names the tag', async () => {
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Nothing published yet');
    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    await screen.findByText('No recipes tagged vegan yet');
    fireEvent.click(screen.getByRole('button', { name: 'Clear tag' }));
    expect(screen.getByRole('button', { name: 'vegan' })).toHaveFocus();
  });

  it('Try again after a failed tag load keeps the tag', async () => {
    renderWithProviders(<ExplorePage />);
    await screen.findByText('Nothing published yet');
    getPage.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByText('No recipes tagged vegan yet');
    expect(getPage).toHaveBeenLastCalledWith(null, undefined, 'vegan');
  });

  it('hides the tag row under Following', async () => {
    renderWithProviders(<ExplorePage />, { user: fakeUser });
    fireEvent.click(await screen.findByRole('button', { name: 'Following' }));
    expect(screen.queryByRole('button', { name: 'vegan' })).not.toBeInTheDocument();
  });

  it('ignores a Load more response that lands after the tag changed', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    getPage
      .mockResolvedValueOnce({ recipes: [cloud({ title: 'Untagged One' })], cursor: {}, hasMore: true })
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce({ recipes: [cloud({ title: 'Vegan One' })], cursor: null, hasMore: false });
    renderWithProviders(<ExplorePage />);
    await screen.findByRole('link', { name: 'Untagged One' });
    fireEvent.click(screen.getByRole('button', { name: 'Load more recipes' }));
    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    await screen.findByText('Vegan One');
    resolveOld({ recipes: [cloud({ title: 'Stale Page' })], cursor: {}, hasMore: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Stale Page')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more recipes' })).not.toBeInTheDocument();
  });
});
