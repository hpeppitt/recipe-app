// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { db } from '../db/database';
import { STORAGE_KEYS } from '../lib/constants';
import type { AppUser } from '../types/recipe';

const getPage = vi.fn();
vi.mock('../services/firestore', () => ({
  getPublishedRecipesPage: (...a: unknown[]) => getPage(...a),
  getRecipesByUsers: vi.fn(async () => []),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../hooks/useProfile', () => ({ useOwnProfile: () => ({ profile: null }) }));
vi.mock('../hooks/useFollow', () => ({
  useFollowingList: () => ({
    followingIds: ['chef'],
    followingProfiles: [{ uid: 'chef', displayName: 'Chef', photoType: 'generated' }],
    isLoading: false,
  }),
}));
vi.mock('../components/notifications/NotificationBell', () => ({ NotificationBell: () => null }));

import { LibraryPage } from './LibraryPage';

const anon: AppUser = { uid: 'anon-1', displayName: 'CrispyWaffle', email: null, isAnonymous: true, emailVerified: false };
const tab = (name: string) => screen.getByRole('radio', { name });

beforeEach(async () => {
  // Node's own (unbacked) localStorage global shadows jsdom's, so stub one.
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  await db.recipes.clear();
  getPage.mockReset();
  getPage.mockResolvedValue({ recipes: [], cursor: null, hasMore: false });
});

describe('LibraryPage tabs', () => {
  it('defaults to My Recipes and reads nothing from the cloud', async () => {
    renderWithProviders(<LibraryPage />);
    expect(tab('My Recipes')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText("You haven't created a recipe yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a recipe' })).toBeInTheDocument();
    expect(getPage).not.toHaveBeenCalled();
  });

  it('lists local recipes on My Recipes', async () => {
    await db.recipes.add(makeRecipe({ title: 'Local Lasagne' }));
    renderWithProviders(<LibraryPage />);
    expect(await screen.findByText('Local Lasagne')).toBeInTheDocument();
  });

  it('switches to Explore, remembers it, and shows its empty state', async () => {
    renderWithProviders(<LibraryPage />);
    fireEvent.click(tab('Explore'));
    expect(tab('Explore')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Nothing published yet')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.LIBRARY_TAB)).toBe('explore');
  });

  it('restores the remembered tab', async () => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_TAB, 'explore');
    getPage.mockResolvedValue({
      recipes: [{ ...makeRecipe({ title: 'Cloud Curry' }), favoriteCount: 0, viewCount: 0 }],
      cursor: null,
      hasMore: false,
    });
    renderWithProviders(<LibraryPage />);
    expect(tab('Explore')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Cloud Curry')).toBeInTheDocument();
  });

  it('ignores an invalid stored tab', () => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_TAB, 'bogus');
    renderWithProviders(<LibraryPage />);
    expect(tab('My Recipes')).toHaveAttribute('aria-checked', 'true');
  });

  it('still works when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    renderWithProviders(<LibraryPage />);
    expect(tab('My Recipes')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(tab('Explore'));
    expect(tab('Explore')).toHaveAttribute('aria-checked', 'true');
  });

  it('offers Following on Explore only, and only to verified accounts', async () => {
    renderWithProviders(<LibraryPage />);
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
    fireEvent.click(tab('Explore'));
    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  it('hides Following from an anonymous account', async () => {
    renderWithProviders(<LibraryPage />, { user: anon });
    fireEvent.click(tab('Explore'));
    await screen.findByText('Nothing published yet');
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
    // Favourites still work for anonymous accounts, as local bookmarks.
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('keeps Load more under a search and says what it searched', async () => {
    getPage.mockResolvedValue({
      recipes: [{ ...makeRecipe({ title: 'Cloud Curry' }), favoriteCount: 0, viewCount: 0 }],
      cursor: {},
      hasMore: true,
    });
    renderWithProviders(<LibraryPage />, { user: fakeUser });
    fireEvent.click(tab('Explore'));
    await screen.findByText('Cloud Curry');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-matches' } });
    expect(screen.getByText(/Searching the 1 recipe loaded so far/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more recipes' })).toBeInTheDocument();
  });

  it('says when Load more fails, keeps the list, and clears on a successful retry', async () => {
    const cloud = (title: string) => ({ ...makeRecipe({ title }), favoriteCount: 0, viewCount: 0 });
    getPage
      .mockResolvedValueOnce({ recipes: [cloud('Page One')], cursor: {}, hasMore: true })
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce({ recipes: [cloud('Page Two')], cursor: null, hasMore: false });
    renderWithProviders(<LibraryPage />);
    fireEvent.click(tab('Explore'));
    await screen.findByText('Page One');

    fireEvent.click(screen.getByRole('button', { name: 'Load more recipes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load more recipes. Try again.');
    expect(screen.getByText('Page One')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more recipes' }));
    expect(await screen.findByText('Page Two')).toBeInTheDocument();
    expect(screen.getByText('Page One')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not claim there are no favourites while more Explore pages exist', async () => {
    getPage.mockResolvedValue({
      recipes: [{ ...makeRecipe({ title: 'Cloud Curry' }), favoriteCount: 0, viewCount: 0 }],
      cursor: {},
      hasMore: true,
    });
    renderWithProviders(<LibraryPage />);
    fireEvent.click(tab('Explore'));
    await screen.findByText('Cloud Curry');
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    expect(screen.getByText(/No favorites in the 1 recipe loaded so far/)).toBeInTheDocument();
    expect(screen.queryByText('No favorites yet')).not.toBeInTheDocument();
  });

  it('shows Could not load with Try again when Explore fails', async () => {
    getPage.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<LibraryPage />);
    fireEvent.click(tab('Explore'));
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing published yet')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledTimes(2);
  });

  it('has no Explore tab in local-only mode', async () => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_TAB, 'explore');
    renderWithProviders(<LibraryPage />, { auth: { isConfigured: false } });
    expect(screen.queryByRole('radio', { name: 'Explore' })).not.toBeInTheDocument();
    expect(await screen.findByText("You haven't created a recipe yet")).toBeInTheDocument();
    expect(getPage).not.toHaveBeenCalled();
  });
});

describe('LibraryPage My Recipes empty states under search', () => {
  const search = (value: string) =>
    fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
  const NEVER = "You haven't created a recipe yet";

  it('shows No results, not the never-created copy, when a search matches none of your recipes', async () => {
    await db.recipes.add(makeRecipe({ title: 'Local Lasagne' }));
    renderWithProviders(<LibraryPage />);
    await screen.findByText('Local Lasagne');
    search('zzzz-no-match');
    expect(await screen.findByText('No results')).toBeInTheDocument();
    // The search box's own clear icon shares the aria-label, so match the visible text.
    expect(screen.getByText('Clear search', { selector: 'button' })).toBeInTheDocument();
    expect(screen.queryByText(NEVER)).not.toBeInTheDocument();
  });

  it('restores the list when Clear search is pressed', async () => {
    await db.recipes.add(makeRecipe({ title: 'Local Lasagne' }));
    renderWithProviders(<LibraryPage />);
    await screen.findByText('Local Lasagne');
    search('zzzz-no-match');
    fireEvent.click(await screen.findByText('Clear search', { selector: 'button' }));
    expect(await screen.findByText('Local Lasagne')).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('shows the never-created copy only with no recipes and an empty search', async () => {
    renderWithProviders(<LibraryPage />);
    expect(await screen.findByText(NEVER)).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('shows No results, not the never-created copy, with no recipes and a non-empty search', async () => {
    renderWithProviders(<LibraryPage />);
    await screen.findByText(NEVER);
    search('anything');
    expect(await screen.findByText('No results')).toBeInTheDocument();
    expect(screen.queryByText(NEVER)).not.toBeInTheDocument();
  });

  it('still shows No results first when the favourites filter is on', async () => {
    await db.recipes.add(makeRecipe({ title: 'Local Lasagne' }));
    renderWithProviders(<LibraryPage />);
    await screen.findByText('Local Lasagne');
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    search('zzzz-no-match');
    expect(await screen.findByText('No results')).toBeInTheDocument();
    expect(screen.queryByText(NEVER)).not.toBeInTheDocument();
    expect(screen.queryByText('No favorites yet')).not.toBeInTheDocument();
  });
});
