// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { db } from '../db/database';
import { Routes, Route } from 'react-router-dom';
const getPublished = vi.fn(async (..._a: unknown[]): Promise<unknown> => null);
vi.mock('../services/firestore', () => ({ getPublishedRecipe: (...a: unknown[]) => getPublished(...a) }));

import { SavedPage } from './SavedPage';
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { clearSavedFavoritesCache } from '../hooks/useSavedFavorites';

const other = { uid: 'chef', displayName: 'Chef Ann' };
const mine = { uid: fakeUser.uid, displayName: 'Me' };

beforeEach(async () => {
  await db.recipes.clear();
  await db.favorites.clear();
  clearSavedFavoritesCache();
  getPublished.mockReset();
  getPublished.mockResolvedValue(null);
  vi.restoreAllMocks();
});

describe('SavedPage', () => {
  it('lists other people\'s recipes as one link each and excludes own', async () => {
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'a', title: 'Ann Soup', createdBy: other }),
      makeRecipe({ id: 'b', title: 'My Stew', createdBy: mine }),
    ]);
    renderWithProviders(<SavedPage />);
    const link = await screen.findByRole('link', { name: 'Ann Soup' });
    expect(link).toHaveAttribute('href', '/recipe/a');
    expect(link).toHaveTextContent('Chef Ann');
    expect(link.querySelectorAll('a,button')).toHaveLength(0);
    expect(link).toHaveAccessibleDescription(/Chef Ann/);
    expect(screen.queryByText('My Stew')).not.toBeInTheDocument();
  });

  it('beside a recipe, demotes its heading to h2 and marks the open recipe current (RL-116)', async () => {
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'a', title: 'Ann Soup', createdBy: other }),
      makeRecipe({ id: 'b', title: 'Ann Stew', createdBy: other }),
    ]);
    renderWithProviders(
      <RecipePaneContext.Provider value="a">
        <SavedPage />
      </RecipePaneContext.Provider>
    );
    expect(await screen.findByRole('link', { name: 'Ann Soup' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Ann Stew' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 2, name: 'Saved' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('shows the empty state with an action', async () => {
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.getByText("Tap the bookmark on any recipe and it'll wait for you here.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore recipes' })).toBeInTheDocument();
  });

  it('sends the empty-state action to /', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>,
      { route: '/saved' }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Explore recipes' }));
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('is empty in local-only mode', async () => {
    await db.recipes.add(makeRecipe({ title: 'Ann Soup', createdBy: other }));
    renderWithProviders(<SavedPage />, { auth: { isConfigured: false } });
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('shows skeleton rows before the live query resolves', () => {
    renderWithProviders(<SavedPage />);
    expect(screen.getByRole('status', { name: 'Loading saved recipes' }).children).toHaveLength(3);
  });

  it('lists a favourite among saved copies, newest kept first', async () => {
    await db.recipes.add(makeRecipe({ id: 's-old', title: 'Old Copy', createdBy: other, createdAt: 100 }));
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'f-new', createdAt: 500 });
    getPublished.mockResolvedValue({ ...makeRecipe({ id: 'f-new', title: 'Fav Pie', createdBy: other, createdAt: 1 }), favoriteCount: 1 });
    renderWithProviders(<SavedPage />);
    await screen.findByRole('link', { name: 'Fav Pie' });
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      expect.stringContaining('Fav Pie'),
      expect.stringContaining('Old Copy'),
    ]);
  });

  it('says how many favourites were deleted', async () => {
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'gone-p', createdAt: 1 });
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText('1 saved recipe was deleted by their authors.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing saved yet')).not.toBeInTheDocument();
  });

  it('says how many need a connection when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'off-p', createdAt: 1 });
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'off-q', createdAt: 2 });
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText('2 saved recipes need a connection to show.')).toBeInTheDocument();
  });

  it('says how many failed and Try again refetches', async () => {
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'fail-p', createdAt: 1 });
    getPublished.mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText(/1 saved recipe couldn't load\./)).toBeInTheDocument();
    getPublished.mockResolvedValue({ ...makeRecipe({ id: 'fail-p', title: 'Back Again', createdBy: other }), favoriteCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Back Again' })).toBeInTheDocument();
  });

  it('shows the offline note, not the failed one, when both apply', async () => {
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'both-p', createdAt: 1 });
    getPublished.mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText(/couldn't load/)).toBeInTheDocument();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await act(() => db.favorites.add({ uid: fakeUser.uid, recipeId: 'both-q', createdAt: 2 }).then(() => {}));
    expect(await screen.findByText('1 saved recipe needs a connection to show.')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/)).not.toBeInTheDocument();
  });

  it('shows the skeleton while a favourite read is pending', async () => {
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'slow-p', createdAt: 1 });
    getPublished.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SavedPage />);
    await waitFor(() => expect(getPublished).toHaveBeenCalled());
    expect(screen.getByRole('status', { name: 'Loading saved recipes' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing saved yet')).not.toBeInTheDocument();
  });

  it('leaves out a favourite of the user\'s own recipe', async () => {
    await db.favorites.add({ uid: fakeUser.uid, recipeId: 'own-p', createdAt: 1 });
    getPublished.mockResolvedValue({ ...makeRecipe({ id: 'own-p', title: 'My Pie', createdBy: mine }), favoriteCount: 1 });
    renderWithProviders(<SavedPage />);
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.queryByText('My Pie')).not.toBeInTheDocument();
  });
});
