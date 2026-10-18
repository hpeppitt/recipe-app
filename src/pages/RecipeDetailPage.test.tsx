// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import type { AppUser } from '../types/recipe';

let recipe = makeRecipe({ id: 'r1', title: 'Soup' });
const getPublishedRecipe = vi.fn();
const publishRecipe = vi.fn();
const trackRecipeShared = vi.fn();
const firebase = vi.hoisted(() => ({ isFirebaseConfigured: true }));
const calls: string[] = [];
const deletePublishedRecipeTree = vi.fn();
const deleteRecipeTree = vi.fn();
const getSubtreeIds = vi.fn();
const navigateSpy = vi.fn();

vi.mock('../services/firestore', () => ({
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  incrementRecipeViews: vi.fn(),
  deletePublishedRecipeTree: (...a: unknown[]) => deletePublishedRecipeTree(...a),
}));
vi.mock('../db/recipes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/recipes')>()),
  deleteRecipeTree: (...a: unknown[]) => deleteRecipeTree(...a),
  getSubtreeIds: (...a: unknown[]) => getSubtreeIds(...a),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock('../services/firebase', () => ({
  get isFirebaseConfigured() {
    return firebase.isFirebaseConfigured;
  },
}));
vi.mock('../services/analytics', () => ({
  trackRecipeViewed: vi.fn(),
  trackRecipeShared: (...a: unknown[]) => trackRecipeShared(...a),
  trackRecipeDeleted: vi.fn(),
}));
vi.mock('../hooks/useRecipe', () => ({
  useRecipe: () => ({ recipe, source: 'local', isLoading: false, cloudError: false, retry: () => {} }),
  useRecipeLineage: () => ({ children: [], ancestors: [], descendantCount: 0, recipes: [], isLoading: false }),
}));
vi.mock('../hooks/useFavorites', () => ({
  useFavorite: () => ({ isFavorite: false, toggleFavorite: vi.fn(), canFavorite: true }),
}));
vi.mock('../hooks/useSuggestions', () => ({
  useSuggestions: () => ({ suggestions: [], approve: vi.fn(), reject: vi.fn() }),
  useSubmitSuggestion: () => ({ submit: vi.fn() }),
}));

import { RecipeDetailPage } from './RecipeDetailPage';

const anon: AppUser = { uid: 'anon-1', displayName: 'Waffle', email: null, isAnonymous: true, emailVerified: false };
const writeText = vi.fn();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  vi.clearAllMocks();
  firebase.isFirebaseConfigured = true;
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

function share(user: AppUser | null) {
  renderWithProviders(
    <Routes>
      <Route path="/recipe/:id" element={<RecipeDetailPage />} />
    </Routes>,
    { route: '/recipe/r1', user }
  );
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
}

const dialog = () => screen.queryByRole('heading', { name: 'Sign up to share this recipe' });

describe('RecipeDetailPage Share', () => {
  it.each([
    ['anonymous', anon],
    ['signed-out', null],
  ])('opens the sign-up dialog for a %s user on an unpublished recipe', async (_l, user) => {
    getPublishedRecipe.mockResolvedValue(null);
    share(user);
    expect(await screen.findByRole('heading', { name: 'Sign up to share this recipe' })).toBeInTheDocument();
    expect(publishRecipe).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(trackRecipeShared).not.toHaveBeenCalled();
  });

  it('copies the cloud link for an anonymous user on a published recipe', async () => {
    getPublishedRecipe.mockResolvedValue({ id: 'r1' });
    share(anon);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/shared\/r1$/)));
    expect(dialog()).not.toBeInTheDocument();
    expect(publishRecipe).not.toHaveBeenCalled();
    expect(trackRecipeShared).toHaveBeenCalledWith('r1');
  });

  it('opens the dialog, not a self-contained link, when the published check rejects', async () => {
    getPublishedRecipe.mockRejectedValue(new Error('offline'));
    share(anon);
    expect(await screen.findByRole('heading', { name: 'Sign up to share this recipe' })).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the cloud link for a verified user when the recipe is published', async () => {
    getPublishedRecipe.mockResolvedValue({ id: 'r1' });
    share(fakeUser);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/shared\/r1$/)));
    expect(dialog()).not.toBeInTheDocument();
  });

  it('copies a self-contained link when Firebase is not configured', async () => {
    firebase.isFirebaseConfigured = false;
    share(null);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/shared#r=')));
    expect(dialog()).not.toBeInTheDocument();
    expect(getPublishedRecipe).not.toHaveBeenCalled();
  });
});

describe('RecipeDetailPage What changed link', () => {
  const show = () =>
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user: fakeUser }
    );

  it('links a variation to its changes screen', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Soup', parentId: 'p', depth: 1, prompt: 'less salt' });
    show();
    expect(screen.getByRole('link', { name: 'See what changed' }).getAttribute('href')).toBe('/recipe/r1/changes');
  });

  it('shows no link on a root recipe', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Soup' });
    show();
    expect(screen.queryByRole('link', { name: 'See what changed' })).toBeNull();
  });
});

describe('RecipeDetailPage Delete', () => {
  beforeEach(() => {
    calls.length = 0;
    getSubtreeIds.mockResolvedValue(['r1', 'r2']);
    deleteRecipeTree.mockImplementation(async () => {
      calls.push('local');
      return ['r1', 'r2'];
    });
  });

  async function confirmDelete(user: AppUser | null) {
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user }
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  }

  const cloudFails = () =>
    deletePublishedRecipeTree.mockImplementationOnce(async () => {
      calls.push('cloud');
      return { deleted: 0, failed: 2 };
    });
  const cloudSucceeds = () =>
    deletePublishedRecipeTree.mockImplementation(async () => {
      calls.push('cloud');
      return { deleted: 2, failed: 0 };
    });
  const failure = () => screen.queryByRole('heading', { name: "Couldn't delete this recipe" });

  it('removes the cloud copy, then the device copy, then leaves, for a verified user', async () => {
    cloudSucceeds();
    await confirmDelete(fakeUser);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
    expect(calls).toEqual(['cloud', 'local']);
    expect(deletePublishedRecipeTree).toHaveBeenCalledWith(fakeUser.uid, 'r1', recipe.rootId, ['r1', 'r2']);
  });

  it('keeps the device copy and shows the failure dialog when the cloud delete fails', async () => {
    cloudFails();
    await confirmDelete(fakeUser);
    expect(await screen.findByRole('heading', { name: "Couldn't delete this recipe" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "It's still saved in your account and on this device. Check your connection and try again. 2 copies couldn't be removed."
      )
    ).toBeInTheDocument();
    expect(deleteRecipeTree).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Leave anyway' })).not.toBeInTheDocument();
  });

  it('Try again repeats the delete and leaves once it succeeds', async () => {
    cloudFails();
    await confirmDelete(fakeUser);
    await screen.findByRole('heading', { name: "Couldn't delete this recipe" });
    cloudSucceeds();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
    expect(calls).toEqual(['cloud', 'cloud', 'local']);
    expect(deletePublishedRecipeTree).toHaveBeenLastCalledWith(fakeUser.uid, 'r1', recipe.rootId, ['r1', 'r2']);
  });

  it('Cancel closes the failure dialog and stays on the recipe', async () => {
    cloudFails();
    await confirmDelete(fakeUser);
    await screen.findByRole('heading', { name: "Couldn't delete this recipe" });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(failure()).not.toBeInTheDocument());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(deleteRecipeTree).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { name: 'Soup' }).length).toBeGreaterThan(0);
  });

  it('deletes locally only for an anonymous user', async () => {
    await confirmDelete(anon);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
    expect(deletePublishedRecipeTree).not.toHaveBeenCalled();
    expect(calls).toEqual(['local']);
  });
});
