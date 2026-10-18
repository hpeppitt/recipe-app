// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
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
const local = makeRecipe({ id: 'v1', parentId: 'root', rootId: 'root', title: 'Spicy Soup', createdBy: { uid: 'u1', displayName: 'Ada' } });
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
    state.recipes = [root, local, cloud];
    state.cloudError = false;
  });

  it('shows the family title and subtitle across local and cloud versions', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Soup' })).toBeTruthy();
    expect(screen.getByText(/^3 versions, 2 cooks, started by Ada in /)).toBeTruthy();
  });

  it('has no view switch while only one view exists', () => {
    renderPage();
    expect(screen.queryByRole('radiogroup', { name: 'Tree view' })).toBeNull();
  });

  it('renders the Tree view for an unknown ?view=', () => {
    renderPage('/recipe/v1/tree?view=bogus');
    expect(screen.getByRole('button', { name: /^.*Spicy Soup.*Current/ })).toBeTruthy();
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
});
