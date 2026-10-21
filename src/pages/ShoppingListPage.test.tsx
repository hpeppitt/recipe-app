// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
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
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { ShoppingListPage } from './ShoppingListPage';

// Stands in for the recipe route and shows the list origin the link carried (RL-225).
function Origin() {
  return <p data-testid="origin">{(useLocation().state as { listOrigin?: string } | null)?.listOrigin}</p>;
}

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
  it('opens a source chip recipe with the list as its origin', () => {
    renderWithProviders(
      <Routes>
        <Route path="/kitchen/list" element={<ShoppingListPage />} />
        <Route path="/recipe/:id" element={<Origin />} />
      </Routes>,
      { route: '/kitchen/list' }
    );
    fireEvent.click(screen.getByRole('link', { name: /Croissant/ }));
    expect(screen.getByTestId('origin')).toHaveTextContent('/kitchen/list');
  });

  it('leaves the h1 to a recipe open beside it and marks its chip current', () => {
    renderWithProviders(
      <RecipePaneContext.Provider value="r1">
        <ShoppingListPage />
      </RecipePaneContext.Provider>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Shopping list' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Produce' })).toBeInTheDocument();
    // The open recipe's chip is the current row, as on Explore and Saved.
    expect(screen.getByRole('link', { name: /Pasta/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: /Croissant/ })).not.toHaveAttribute('aria-current');
  });

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

  describe('Shop mode (RL-217)', () => {
    const wakeRequest = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    afterEach(() => {
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    });
    const withWakeLock = () => Object.defineProperty(navigator, 'wakeLock', { value: { request: wakeRequest }, configurable: true });

    it('toggles with ?mode=shop and hides the normal extras', () => {
      renderWithProviders(<ShoppingListPage />);
      fireEvent.click(screen.getByRole('button', { name: /Shop mode/ }));
      expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
      expect(screen.getByText('2 left')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Recipes on the list' })).toBeNull();
      expect(screen.queryByText(/In your pantry/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Bought it all' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.getByRole('button', { name: /Shop mode/ })).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Bought it all' })).toBeInTheDocument();
    });

    it('opens from the URL with larger type and targets, and ticked lines move to Got it', () => {
      (hook.kitchen as { shopping: { done: boolean }[] }).shopping[0].done = true;
      renderWithProviders(<ShoppingListPage />, { route: '/kitchen/list?mode=shop' });
      expect(screen.getByText('1 left')).toBeInTheDocument();
      expect(screen.getByText('Butter')).toHaveClass('text-[22px]');
      expect(screen.getByRole('heading', { name: 'Dairy' })).toHaveClass('text-[14px]');
      const got = screen.getByRole('region', { name: 'Got it' });
      expect(within(got).getByRole('checkbox', { name: 'Onions, 2' })).toBeChecked();
      expect(within(screen.getByRole('region', { name: 'Dairy' })).queryByRole('checkbox', { name: /Onions/ })).toBeNull();
      expect(screen.getByText('Your screen may still dim.')).toBeInTheDocument();
    });

    it('announces N left as a status', () => {
      renderWithProviders(<ShoppingListPage />, { route: '/kitchen/list?mode=shop' });
      expect(screen.getByText('2 left')).toHaveAttribute('role', 'status');
    });

    it('shows All done with a Done button when nothing is left', () => {
      (hook.kitchen as { shopping: { done: boolean }[] }).shopping.forEach((l) => (l.done = true));
      renderWithProviders(<ShoppingListPage />, { route: '/kitchen/list?mode=shop' });
      expect(screen.getByText('All done')).toBeInTheDocument();
      expect(screen.getByText('0 left')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[1]);
      expect(screen.getByRole('button', { name: /Shop mode/ })).toBeInTheDocument();
    });

    it('locks only the row being written, then focuses the next unticked row', async () => {
      let done!: () => void;
      toggleLine.mockReturnValue(new Promise<void>((r) => (done = r)));
      renderWithProviders(<ShoppingListPage />, { route: '/kitchen/list?mode=shop' });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Butter, 2' }));
      expect(screen.getByRole('checkbox', { name: 'Butter, 2' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Onions, 2' })).not.toBeDisabled();
      done();
      await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Onions, 2' })).toHaveFocus());
    });

    it('requests the wake lock only in shop mode', async () => {
      withWakeLock();
      wakeRequest.mockClear();
      renderWithProviders(<ShoppingListPage />);
      expect(wakeRequest).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: /Shop mode/ }));
      await waitFor(() => expect(wakeRequest).toHaveBeenCalledWith('screen'));
      expect(screen.queryByText('Your screen may still dim.')).toBeNull();
    });
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
