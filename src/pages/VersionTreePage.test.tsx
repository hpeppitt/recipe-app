// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeIngredient, makeRecipe } from '../test/factories';
import { buildTree } from '../lib/tree';
import type { Recipe } from '../types/recipe';

const march = new Date(2026, 2, 10).getTime();
const root = makeRecipe({
  id: 'root',
  parentId: null,
  rootId: 'root',
  title: 'Soup',
  createdAt: march,
  createdBy: { uid: 'u1', displayName: 'Ada' },
});
const local = makeRecipe({ id: 'v1', parentId: 'root', rootId: 'root', title: 'Spicy Soup', ingredients: [makeIngredient('chilli')], createdBy: { uid: 'u1', displayName: 'Ada' } });
// A cloud-only variation by a second account, as useRecipeTree merges it.
const cloud = makeRecipe({ id: 'v2', parentId: 'root', rootId: 'root', title: 'Soup 2', createdBy: { uid: 'u2', displayName: 'Bo' } });

const navigateSpy = vi.fn();
const retry = vi.fn();
const state = vi.hoisted(() => ({ recipes: [] as Recipe[], cloudError: false }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock('../hooks/useRecipe', () => ({
  useRecipe: () => ({
    recipe: state.recipes.find((r) => r.id === 'v1'),
    isLoading: false,
    cloudError: state.cloudError,
    retry: () => retry(),
  }),
}));
vi.mock('../hooks/useRecipeTree', () => ({
  useRecipeTree: () => ({
    recipes: state.recipes,
    tree: state.recipes.length ? buildTree(state.recipes) : null,
    isLoading: false,
  }),
}));

const addRecipeToKitchen = vi.fn();
vi.mock('../hooks/useKitchen', () => ({
  addRecipeToKitchen: (...a: unknown[]) => addRecipeToKitchen(...a),
  resolveKitchenId: async (uid: string) => uid,
  KITCHEN_BUSY_MESSAGE: 'busy',
  KITCHEN_FULL_MESSAGE: 'full',
  KITCHEN_MAYBE_SAVED_MESSAGE: 'maybe',
}));
vi.mock('../services/firestore', () => ({
  getKitchenOnce: async () => null,
  getOwnCooksInFamily: async () => [],
}));

import { VersionTreePage } from './VersionTreePage';

function renderPage(route = '/recipe/v1/tree') {
  return renderWithProviders(
    <Routes>
      <Route path="/recipe/:id/tree" element={<VersionTreePage />} />
    </Routes>,
    { route }
  );
}

describe('VersionTreePage', () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    retry.mockClear();
    addRecipeToKitchen.mockReset();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    state.recipes = [root, local, cloud];
    state.cloudError = false;
  });

  it('shows the family title and subtitle across local and cloud versions', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Soup' })).toBeTruthy();
    expect(screen.getByText(/^3 versions, 2 cooks, started by Ada in /)).toBeTruthy();
  });

  it('shows the Tree and Timeline switch, and ?view=timeline draws the timeline', () => {
    renderPage('/recipe/v1/tree?view=timeline');
    expect(screen.getByRole('radiogroup', { name: 'Tree view' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Tree', 'Timeline', 'Map']);
    expect(screen.getByRole('region', { name: /timeline/i })).toBeTruthy();
  });

  it('renders the Tree view for an unknown ?view=', () => {
    renderPage('/recipe/v1/tree?view=bogus');
    expect(screen.getByRole('button', { name: /^.*Spicy Soup.*current version/ })).toBeTruthy();
  });

  it('Branch from navigates to the variation composer', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Branch from "Spicy Soup"' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/v1/vary');
  });

  it('shows Try again and no Branch bar on a cloud error', () => {
    state.cloudError = true;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Branch from/ })).toBeNull();
  });

  it('adds the version the user is on from the header button and toasts the count', async () => {
    addRecipeToKitchen.mockResolvedValue(3);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Add \d+ things? to the list/ }));
    expect(await screen.findByText('Added 3 things to your list')).toBeTruthy();
    expect(addRecipeToKitchen).toHaveBeenCalledWith('test-user', local, local.servings);
  });

  it('says so when the add fails', async () => {
    addRecipeToKitchen.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Add \d+ things? to the list/ }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't add to your list. Check your connection and try again.");
    // The sheet stays open on failure.
    expect(screen.getByRole('radiogroup', { name: /shopping for/ })).toBeTruthy();
  });

  it('sends a signed-out visitor to sign in, without opening the sheet', () => {
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id/tree" element={<VersionTreePage />} />
      </Routes>,
      { route: '/recipe/v1/tree', user: null }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    expect(screen.queryByRole('radiogroup', { name: /shopping for/ })).toBeNull();
  });
});
