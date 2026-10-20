// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { db } from '../db/database';
import { clearForestCache } from '../hooks/useForest';

const getUserRecipes = vi.fn();
const getForestFamily = vi.fn();
vi.mock('../services/firestore', () => ({
  getUserRecipes: (...a: unknown[]) => getUserRecipes(...a),
  getForestFamily: (...a: unknown[]) => getForestFamily(...a),
  isFollowing: vi.fn(async () => false),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackFollowToggled: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../hooks/useProfile', () => ({
  useOwnProfile: () => ({ profile: null, loaded: true }),
  usePublicProfile: () => ({ profile: { uid: 'chef', displayName: 'Hana', photoType: 'generated' }, isLoading: false, error: false, retry: vi.fn() }),
}));

import { ForestPage } from './ForestPage';

const hana = { uid: 'chef', displayName: 'Hana' };
const other = { uid: 'o', displayName: 'Omar' };

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(route: string, user: typeof fakeUser | null = fakeUser, isLoading = false) {
  return renderWithProviders(
    <Routes>
      <Route path="/profile/forest" element={<ForestPage />} />
      <Route path="/profile/:uid/forest" element={<ForestPage />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route, user, auth: { isLoading } }
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearForestCache();
  await db.recipes.clear();
});

describe('ForestPage', () => {
  it('shows headline numbers, tile meta and opens the tree', async () => {
    // Hana planted "Soup" (2 branches, one by Omar) and grew 1 branch on Omar's "Bread".
    const soup = makeRecipe({ id: 's', title: 'Soup', createdBy: hana, createdAt: 1 });
    const soup2 = makeRecipe({ id: 's2', parentId: 's', rootId: 's', title: 'Soup 2', createdBy: other, createdAt: 2 });
    const soup3 = makeRecipe({ id: 's3', parentId: 's', rootId: 's', title: 'Soup 3', createdBy: hana, createdAt: 3 });
    const bread = makeRecipe({ id: 'b', title: 'Bread', createdBy: other, createdAt: 1 });
    const bread2 = makeRecipe({ id: 'b2', parentId: 'b', rootId: 'b', title: 'Bread 2', createdBy: hana, createdAt: 4 });
    getUserRecipes.mockResolvedValue([soup, soup3, bread2]);
    getForestFamily.mockImplementation(async (id: string) => (id === 's' ? { recipes: [soup, soup2, soup3], count: 3 } : { recipes: [bread, bread2], count: 2 }));
    renderAt('/profile/chef/forest');

    expect(await screen.findByRole('heading', { level: 2, name: 'Planted 1 recipe. 2 branches have grown from it.' })).toBeInTheDocument();
    expect(getForestFamily).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Planted · 2 branches')).toBeInTheDocument();
    expect(screen.getByText("Grew 1 on Omar's")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bread/ })).toHaveAttribute('href', '/recipe/b2/tree');
    fireEvent.click(screen.getByRole('link', { name: /Soup/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/recipe/s/tree');
  });

  it('draws a family from the person own versions when its tree read fails', async () => {
    const soup = makeRecipe({ id: 's', title: 'Soup', createdBy: hana });
    getUserRecipes.mockResolvedValue([soup]);
    getForestFamily.mockRejectedValue(new Error('x'));
    renderAt('/profile/chef/forest');
    expect(await screen.findByText('Planted · 0 branches')).toBeInTheDocument();
    expect(screen.getByText("Some branches couldn't load")).toBeInTheDocument();
    getForestFamily.mockResolvedValue({ recipes: [soup], count: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Planted · 3 branches')).toBeInTheDocument();
  });

  it('uses the family count, not the drawn list, for meta and headline', async () => {
    const soup = makeRecipe({ id: 's', title: 'Soup', createdBy: hana });
    getUserRecipes.mockResolvedValue([soup]);
    getForestFamily.mockResolvedValue({ recipes: [soup], count: 57 });
    renderAt('/profile/chef/forest');
    expect(await screen.findByText('Planted · 56 branches')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Planted 1 recipe. 56 branches have grown from it.');
  });

  it('shows the error with Try again, never an empty state, when the list fails', async () => {
    getUserRecipes.mockRejectedValueOnce(new Error('offline'));
    renderAt('/profile/chef/forest');
    expect(await screen.findByText("Couldn't load the forest")).toBeInTheDocument();
    expect(screen.queryByText('Nothing planted yet')).toBeNull();
    getUserRecipes.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Nothing planted yet')).toBeInTheDocument();
  });

  it('own forest reads Dexie, not the cloud list, and caps at 12 with "and N more"', async () => {
    for (let i = 0; i < 14; i++) await db.recipes.add(makeRecipe({ id: `r${i}`, createdBy: { uid: fakeUser.uid, displayName: null }, createdAt: i }));
    getForestFamily.mockResolvedValue({ recipes: [], count: 0 });
    renderAt('/profile/forest');
    expect(await screen.findByText('and 2 more')).toBeInTheDocument();
    expect(getUserRecipes).not.toHaveBeenCalled();
    expect(getForestFamily).toHaveBeenCalledTimes(12);
  });

  it('shows Nothing planted yet for an empty own library', async () => {
    renderAt('/profile/forest');
    await waitFor(() => expect(screen.getByText('Nothing planted yet')).toBeInTheDocument());
  });

  it('waits for auth on a cold load instead of redirecting', async () => {
    renderAt('/profile/forest', null, true);
    expect(screen.getByRole('status', { name: 'Loading forest' })).toBeInTheDocument();
    expect(screen.queryByTestId('where')).toBeNull();
  });
});
