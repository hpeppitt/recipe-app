// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeCook, makeRecipe } from '../test/factories';
import { db } from '../db/database';
import type { Cook } from '../types/social';

let own: { status: 'loading' | 'ready' | 'error'; cooks: Cook[] } = { status: 'ready', cooks: [] };
vi.mock('../hooks/useCooks', () => ({ useOwnCooks: () => own }));
const getPublishedRecipe = vi.fn();
vi.mock('../services/firestore', () => ({ getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { CookLogPage } from './CookLogPage';

// Stands in for the recipe route and shows the list origin the link carried (RL-225).
function Origin() {
  return <p data-testid="origin">{(useLocation().state as { listOrigin?: string } | null)?.listOrigin}</p>;
}

const now = Date.now();
beforeEach(async () => {
  await db.recipes.clear();
  getPublishedRecipe.mockReset();
  own = { status: 'ready', cooks: [] };
});

describe('CookLogPage (RL-200)', () => {
  it.each([
    ['the recipe', /Dal/],
    ['the branch', 'Open the branch'],
  ])('opens %s with the cook log as its origin', async (_, name) => {
    await db.recipes.add(makeRecipe({ id: 'r1', title: 'Dal', emoji: '🍲' }));
    own = { status: 'ready', cooks: [makeCook({ id: 'a', recipeId: 'r1', vote: 'tweak', branchId: 'br', createdAt: now })] };
    renderWithProviders(
      <Routes>
        <Route path="/kitchen/log" element={<CookLogPage />} />
        <Route path="/recipe/:id" element={<Origin />} />
      </Routes>,
      { route: '/kitchen/log' }
    );
    fireEvent.click(await screen.findByRole('link', { name }));
    expect(screen.getByTestId('origin')).toHaveTextContent('/kitchen/log');
  });

  it('shows the summary, titles, notes and tags with the branch link', async () => {
    await db.recipes.add(makeRecipe({ id: 'r1', title: 'Dal', emoji: '🍲' }));
    getPublishedRecipe.mockResolvedValue({ title: 'Soup', emoji: '🥣' });
    own = {
      status: 'ready',
      cooks: [
        makeCook({ id: 'a', recipeId: 'r1', vote: 'again', note: 'Lovely', createdAt: now }),
        makeCook({ id: 'b', recipeId: 'r2', vote: 'tweak', createdAt: now }),
        makeCook({ id: 'c', recipeId: 'r2', vote: 'tweak', branchId: 'br', createdAt: now }),
      ],
    };
    renderWithProviders(<CookLogPage />);
    expect(screen.getByText('3 cooks · 2 recipes · 1 branch grew from a note')).toBeInTheDocument();
    expect(await screen.findByText('Dal')).toBeInTheDocument();
    expect(await screen.findAllByText('Soup')).toHaveLength(2);
    expect(screen.getByText('“Lovely”')).toBeInTheDocument();
    expect(screen.getByText('Again')).toBeInTheDocument();
    expect(screen.getByText('Tweak')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the branch' })).toHaveAttribute('href', '/recipe/br');
    expect(getPublishedRecipe).toHaveBeenCalledTimes(1);
  });

  it('says A deleted recipe when the recipe is gone', async () => {
    getPublishedRecipe.mockResolvedValue(null);
    own = { status: 'ready', cooks: [makeCook({ recipeId: 'gone', createdAt: now })] };
    renderWithProviders(<CookLogPage />);
    await waitFor(() => expect(screen.getByText('A deleted recipe')).toBeInTheDocument());
  });

  it('shows the empty state', () => {
    renderWithProviders(<CookLogPage />);
    expect(screen.getByText('Nothing cooked yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore recipes' })).toBeInTheDocument();
  });

  it('asks to sign in when signed out or anonymous', () => {
    renderWithProviders(<CookLogPage />, { user: null });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a skeleton while auth loads', () => {
    renderWithProviders(<CookLogPage />, { user: null, auth: { isLoading: true } });
    expect(screen.getByRole('status', { name: 'Loading cook log' })).toBeInTheDocument();
  });

  it('asks an unverified signed-in user to verify, and hides Sign in without Firebase', () => {
    renderWithProviders(<CookLogPage />, { user: { ...fakeUser, emailVerified: false } });
    expect(screen.getByText('Verify your email to see your cook log')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('hides Sign in when Firebase is not configured', () => {
    renderWithProviders(<CookLogPage />, { user: null, auth: { isConfigured: false } });
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('shows Recipe while a lookup is pending or has failed', async () => {
    getPublishedRecipe.mockRejectedValue(new Error('x'));
    own = { status: 'ready', cooks: [makeCook({ recipeId: 'zz', createdAt: now })] };
    renderWithProviders(<CookLogPage />);
    expect(screen.getByText('Recipe')).toBeInTheDocument();
    await waitFor(() => expect(getPublishedRecipe).toHaveBeenCalled());
    expect(screen.getByText('Recipe')).toBeInTheDocument();
  });

  it('asks an anonymous account to sign in', () => {
    renderWithProviders(<CookLogPage />, { user: { ...fakeUser, isAnonymous: true, emailVerified: false } });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
