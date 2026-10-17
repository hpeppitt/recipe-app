// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import type { AppUser } from '../types/recipe';

const recipe = makeRecipe({ id: 'r1', title: 'Soup' });
const getPublishedRecipe = vi.fn();
const publishRecipe = vi.fn();
const trackRecipeShared = vi.fn();
const firebase = vi.hoisted(() => ({ isFirebaseConfigured: true }));

vi.mock('../services/firestore', () => ({
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  incrementRecipeViews: vi.fn(),
  deletePublishedRecipeTree: vi.fn(),
}));
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
  useRecipeLineage: () => ({ children: [], ancestors: [], descendantCount: 0 }),
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
