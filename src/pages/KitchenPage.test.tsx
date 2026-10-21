// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';

type Line = { id: string; name: string; amount: number | null; unit: string | null; aisle: string; sources: never[]; done: boolean };
const line = (name: string): Line => ({ id: name, name, amount: null, unit: null, aisle: 'Other', sources: [], done: false });
let hook: { kitchen: { shopping: Line[]; pantry: { id: string; name: string }[] } | null; loading: boolean; error?: string | null } = { kitchen: null, loading: false };
let savedLoading = false;
let saved: { id: string; title: string; emoji: string }[] = [];
const countUserCooks = vi.fn();
vi.mock('../hooks/useKitchen', () => ({ useKitchen: () => hook }));
vi.mock('../hooks/useSavedFavorites', () => ({ useSavedFavorites: () => ({ rows: saved, isLoading: savedLoading }) }));
vi.mock('../services/firestore', () => ({ countUserCooks: (...a: unknown[]) => countUserCooks(...a) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { KitchenPage } from './KitchenPage';

beforeEach(() => {
  hook = { kitchen: { shopping: [line('milk'), line('eggs')], pantry: [{ id: 'p', name: 'salt' }] }, loading: false };
  saved = [];
  savedLoading = false;
  countUserCooks.mockReset().mockResolvedValue(14);
});

describe('KitchenPage (RL-214)', () => {
  it('shows the counts, with Shopping list and Cook log the linked tiles', async () => {
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText('2 to buy')).toBeInTheDocument();
    expect(screen.getByText('1 thing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Shopping list/ })).toHaveAttribute('href', '/kitchen/list');
    expect(screen.queryByRole('link', { name: /Pantry/ })).toBeNull();
    expect(await screen.findByRole('link', { name: /Cook log.*14 cooks/ })).toHaveAttribute('href', '/kitchen/log');
    expect(countUserCooks).toHaveBeenCalledWith(fakeUser.uid);
  });

  it('shows a dash for the cook count while it is unavailable', async () => {
    countUserCooks.mockRejectedValue(new Error('x'));
    renderWithProviders(<KitchenPage />);
    await waitFor(() => expect(countUserCooks).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: /Cook log.*–/ })).toBeInTheDocument();
  });

  it('shows the error state when the kitchen cannot load', () => {
    hook = { kitchen: null, loading: false, error: 'x' };
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText("Couldn't load your kitchen")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows saved skeletons while loading, and no empty line', () => {
    savedLoading = true;
    renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('status', { name: 'Loading saved recipes' })).toBeInTheDocument();
    expect(screen.queryByText(/Tap the bookmark/)).toBeNull();
  });

  it('words the card by state', () => {
    const a = renderWithProviders(<KitchenPage />, { user: { ...fakeUser, emailVerified: false } });
    expect(screen.getByText('Verify your email to keep a shopping list and pantry')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    a.unmount();
    renderWithProviders(<KitchenPage />, { user: null, auth: { isConfigured: false } });
    expect(screen.getByText('Kitchen needs an online account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('keeps This week as a disabled tile, not a link', () => {
    renderWithProviders(<KitchenPage />);
    const tile = screen.getByText('This week').closest('[aria-disabled="true"]');
    expect(tile).not.toBeNull();
    expect(tile?.closest('a')).toBeNull();
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('shows skeleton tiles until the kitchen arrives', () => {
    hook = { kitchen: null, loading: true };
    renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('status', { name: 'Loading kitchen' })).toBeInTheDocument();
    expect(screen.queryByText('Pantry')).toBeNull();
  });

  it('lists saved recipes with See all, or the empty line', () => {
    saved = [{ id: 'r1', title: 'Dal', emoji: '🍲' }];
    const { unmount } = renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('link', { name: 'Dal' })).toHaveAttribute('href', '/recipe/r1');
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/saved');
    unmount();
    saved = [];
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText("Tap the bookmark on any recipe and it'll wait for you here.")).toBeInTheDocument();
  });

  it('asks signed-out users to sign in, and still shows the Saved row', () => {
    saved = [{ id: 'r1', title: 'Dal', emoji: '🍲' }];
    renderWithProviders(<KitchenPage />, { user: null });
    expect(screen.getByText('Sign in to keep a shopping list and pantry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Pantry')).toBeNull();
    expect(screen.getByRole('link', { name: 'Dal' })).toBeInTheDocument();
    expect(countUserCooks).not.toHaveBeenCalled();
  });
});
