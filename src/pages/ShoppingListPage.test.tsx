// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';

const src = (recipeId: string, emoji: string, title: string) => ({ recipeId, emoji, title, amount: null });
const line = (name: string, aisle: string, sources = [src('r1', '🍝', 'Pasta')]) => ({
  id: name, name, amount: 2, unit: null, aisle, sources, done: false,
});
const toggleLine = vi.fn();
const removeSource = vi.fn();
const boughtItAll = vi.fn();
let hook: Record<string, unknown>;
vi.mock('../hooks/useKitchen', () => ({ useKitchen: () => hook }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { shareText } from '../lib/shopping';
import { ShoppingListPage } from './ShoppingListPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

beforeEach(() => {
  toggleLine.mockReset().mockResolvedValue(undefined);
  removeSource.mockReset().mockResolvedValue(undefined);
  boughtItAll.mockReset().mockResolvedValue(undefined);
  hook = {
    kitchen: {
      shopping: [line('Onions', 'Produce'), line('Butter', 'Dairy', [src('r1', '🍝', 'Pasta'), src('r2', '🥐', 'Croissant')]), line('Eggs', 'Dairy')],
      pantry: [{ id: 'p', name: 'eggs' }],
    },
    loading: false,
    error: null,
    toggleLine, removeSource, boughtItAll,
  };
});

describe('ShoppingListPage (RL-216)', () => {
  it('groups by aisle, with pantry lines out of the aisles and in the notice', () => {
    renderWithProviders(<ShoppingListPage />);
    expect(screen.getByRole('region', { name: 'Produce' })).toBeInTheDocument();
    const dairy = screen.getByRole('region', { name: 'Dairy' });
    expect(within(dairy).getByRole('checkbox', { name: 'Butter, 2' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Eggs/ })).toBeNull();
    expect(screen.getByText('In your pantry: eggs')).toBeInTheDocument();
    expect(screen.getByText('2 to buy · 1 already in the pantry')).toBeInTheDocument();
  });

  it('toggles a line and removes a source', async () => {
    renderWithProviders(<ShoppingListPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Onions, 2' }));
    expect(toggleLine).toHaveBeenCalledWith('Onions', true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Croissant' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Croissant' }));
    expect(removeSource).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Croissant from the list?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeSource).toHaveBeenCalledWith('r2'));
  });

  it('disables the controls while a write runs', async () => {
    let done!: () => void;
    toggleLine.mockReturnValue(new Promise<void>((r) => (done = r)));
    renderWithProviders(<ShoppingListPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Onions, 2' }));
    expect(screen.getByRole('button', { name: 'Remove Pasta' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bought it all' })).toBeDisabled();
    done();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bought it all' })).not.toBeDisabled());
  });

  it('builds share text that is only the list', () => {
    const toBuy = (hook.kitchen as { shopping: never[] }).shopping;
    expect(shareText(toBuy)).toBe('Shopping list\n\nPRODUCE\n- Onions, 2\n\nDAIRY\n- Butter, 2\n- Eggs, 2');
  });

  it('shares only unticked lines and hides Share when none are left', () => {
    const k = hook.kitchen as { shopping: { done: boolean }[] };
    k.shopping[0].done = true;
    expect(shareText((k.shopping as never[]).filter((l: { done: boolean }) => !l.done))).not.toContain('Onions');
    k.shopping.forEach((l) => (l.done = true));
    renderWithProviders(<ShoppingListPage />);
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('shows a skeleton, not the error, until the hook reports an error', () => {
    hook = { ...hook, kitchen: null, loading: false, error: null };
    const a = renderWithProviders(<ShoppingListPage />);
    expect(screen.queryByText("Couldn't load your kitchen")).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading shopping list' })).toBeInTheDocument();
    a.unmount();
    hook = { ...hook, error: 'x' };
    renderWithProviders(<ShoppingListPage />);
    expect(screen.getByText("Couldn't load your kitchen")).toBeInTheDocument();
  });

  it('shares through the Web Share API, else copies with a toast', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    renderWithProviders(<ShoppingListPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: expect.stringMatching(/^Shopping list\n\n/) }));
    Object.assign(navigator, { share: undefined });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalled();
  });

  it('asks before Bought it all, and Keep it does nothing', async () => {
    renderWithProviders(<ShoppingListPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Bought it all' }));
    expect(screen.getByText('Move everything to the pantry?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(boughtItAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bought it all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(boughtItAll).toHaveBeenCalledTimes(1));
  });

  it('shows Shop mode inactive', () => {
    renderWithProviders(<ShoppingListPage />);
    expect(screen.getByRole('button', { name: /Shop mode/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the empty state, a skeleton, and the signed-out card', () => {
    hook = { ...hook, kitchen: { shopping: [], pantry: [] } };
    const a = renderWithProviders(<ShoppingListPage />);
    expect(screen.getByText('Add a recipe\'s ingredients from its menu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore recipes' })).toBeInTheDocument();
    a.unmount();
    hook = { ...hook, kitchen: null, loading: true };
    const b = renderWithProviders(<ShoppingListPage />);
    expect(screen.getByRole('status', { name: 'Loading shopping list' })).toBeInTheDocument();
    b.unmount();
    renderWithProviders(<ShoppingListPage />, { user: null });
    expect(screen.getByText('Sign in to keep a shopping list and pantry')).toBeInTheDocument();
  });
});
