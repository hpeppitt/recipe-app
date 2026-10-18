// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import type { Ingredient, Recipe } from '../types/recipe';

const ing = (name: string, amount: number | null = 1, unit: string | null = null): Ingredient => ({
  amount,
  unit,
  name,
  notes: null,
  group: null,
});
const step = (n: number, text: string) => ({ step: n, text, group: null });

const parent = makeRecipe({
  id: 'p',
  rootId: 'p',
  title: 'Plain Cake',
  emoji: '🍰',
  totalTime: 30,
  servings: 4,
  ingredients: [ing('flour', 100, 'g'), ing('sugar', 50, 'g'), ing('salt', 1, 'tsp')],
  instructions: [step(1, 'Mix the flour well'), step(2, 'Bake for 20 minutes')],
});
const child = makeRecipe({
  id: 'c',
  parentId: 'p',
  rootId: 'p',
  title: 'Nutty Cake',
  emoji: '🥜',
  totalTime: 45,
  servings: 6,
  prompt: 'add nuts',
  createdBy: { uid: 'u1', displayName: 'Ada' },
  ingredients: [ing('flour', 150, 'g'), ing('salt', 1, 'tsp'), ing('walnuts', 80, 'g')],
  instructions: [step(1, 'Mix the flour gently'), step(2, 'Bake for 20 minutes')],
});
const root = makeRecipe({ id: 'r', rootId: 'r', title: 'Root' });
const cousin = makeRecipe({ id: 'x', rootId: 'other', title: 'Cousin Pie', emoji: '🥧', ingredients: [ing('flour', 100, 'g')] });

type Result = { recipe?: Recipe; isLoading: boolean; cloudError: boolean };
const state = vi.hoisted(() => ({ byId: {} as Record<string, unknown> }));
const retry = vi.fn();

vi.mock('../hooks/useRecipe', () => ({
  useRecipe: (id?: string) => ({
    recipe: undefined,
    isLoading: false,
    cloudError: false,
    ...((id && (state.byId[id] as Result)) || {}),
    retry: () => retry(id),
  }),
}));

import { RecipeChangesPage } from './RecipeChangesPage';

function renderPage(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/recipe/:id/changes" element={<RecipeChangesPage />} />
    </Routes>,
    { route }
  );
}
const found = (r: Recipe): Result => ({ recipe: r, isLoading: false, cloudError: false });

describe('RecipeChangesPage', () => {
  beforeEach(() => {
    retry.mockClear();
    state.byId = { p: found(parent), c: found(child), r: found(root), x: found(cousin) };
  });

  it('compares a version with its parent', () => {
    renderPage('/recipe/c/changes');
    expect(screen.getByRole('heading', { level: 1, name: 'What changed' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compared version: Plain Cake' }).getAttribute('href')).toBe('/recipe/p');
    expect(screen.getByRole('link', { name: 'This version: Nutty Cake' }).getAttribute('href')).toBe('/recipe/c');
    expect(screen.getByText('Ada asked: "add nuts"')).toBeTruthy();
    expect(screen.getByText('Total time 45 min, was 30 min · Serves 6, was 4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cook parent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cook this one' })).toBeTruthy();
  });

  it('compares against ?vs= even from another family, and labels the footer Cook that one', () => {
    renderPage('/recipe/c/changes?vs=x');
    expect(screen.getByRole('link', { name: 'Compared version: Cousin Pie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cook that one' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cook parent' })).toBeNull();
  });

  it('shows the original state for a root recipe and for ?vs= equal to the id', () => {
    const { unmount } = renderPage('/recipe/r/changes');
    expect(screen.getByRole('heading', { name: 'This is the original' })).toBeTruthy();
    expect(screen.getByText('There is nothing before it to compare with.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to recipe' })).toBeTruthy();
    unmount();
    renderPage('/recipe/c/changes?vs=c');
    expect(screen.getByRole('heading', { name: 'This is the original' })).toBeTruthy();
  });

  it('shows changed, added and removed rows with screen-reader prefixes and struck old values', () => {
    renderPage('/recipe/c/changes');
    const ingredients = within(screen.getByRole('heading', { name: 'Ingredients' }).closest('section')!);
    const rows = ingredients.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const changed = rows.find((r) => r.textContent?.includes('Changed:'))!;
    expect(within(changed).getByText('Changed:')).toBeTruthy();
    expect(changed.querySelector('del')?.textContent).toBe('was 100 g');
    expect(changed.textContent).toContain('150 g flour');
    const added = rows.find((r) => r.textContent?.includes('Added:'))!;
    expect(added.textContent).toContain('walnuts');
    const removed = rows.find((r) => r.textContent?.includes('Removed:'))!;
    expect(removed.textContent).toContain('sugar');
    expect(removed.querySelector('.line-through')).toBeTruthy();
    // The strike covers the text, not the screen-reader prefix.
    expect(removed.querySelector('.line-through')?.textContent).not.toContain('Removed:');
    expect(screen.queryByText('1 tsp salt')).toBeNull();
  });

  it('highlights inserted and deleted method words and hides unchanged steps', () => {
    renderPage('/recipe/c/changes');
    const method = screen.getByRole('heading', { name: 'Method' }).closest('section')!;
    expect(method.querySelector('ins')?.textContent).toBe('added gently');
    expect(method.querySelector('del')?.textContent).toBe('removed well');
    expect(within(method).queryByText('Bake for 20 minutes')).toBeNull();
  });

  it('shows the identical state', () => {
    state.byId.c = found({ ...parent, id: 'c', parentId: 'p', title: 'Copy' });
    renderPage('/recipe/c/changes');
    expect(screen.getByText('No changes to the ingredients or method.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ingredients' })).toBeNull();
  });

  it('toggling Side by side shows unchanged steps and rows', () => {
    renderPage('/recipe/c/changes');
    expect(screen.getByRole('radiogroup', { name: 'Comparison' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Side by side' }));
    expect(screen.getAllByText('Bake for 20 minutes')).toHaveLength(2);
    // Column headers: the pills also show the titles, so only the headers are plain paragraphs.
    expect(screen.getByText('Plain Cake', { selector: 'p.truncate' })).toBeTruthy();
    expect(screen.getByText('Nutty Cake', { selector: 'p.truncate' })).toBeTruthy();
    expect(screen.getAllByText(/salt/)).toHaveLength(2);
  });

  it('shows loading while either recipe is loading', () => {
    state.byId.p = { isLoading: true, cloudError: false };
    renderPage('/recipe/c/changes');
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Recipe not found')).toBeNull();
  });

  it('shows a load error with Try again calling both retries', () => {
    state.byId.p = { isLoading: false, cloudError: true };
    renderPage('/recipe/c/changes');
    expect(screen.getByRole('alert').textContent).toContain('Could not load this comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledWith('c');
    expect(retry).toHaveBeenCalledWith('p');
  });

  it('shows Recipe not found when either side is missing', () => {
    state.byId.p = { isLoading: false, cloudError: false };
    const { unmount: unmount2 } = renderPage('/recipe/c/changes');
    expect(screen.getByRole('heading', { name: 'Recipe not found' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to recipe' })).toBeTruthy();
    unmount2();
    renderPage('/recipe/nope/changes');
    expect(screen.getByRole('heading', { name: 'Recipe not found' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to recipe' })).toBeNull();
  });
});
