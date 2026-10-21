// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  collections: [] as { id: string; name: string; recipeIds: string[] }[],
  loading: false,
  error: null as string | null,
  rename: vi.fn(),
  del: vi.fn(),
  remove: vi.fn(),
  retry: vi.fn(),
  bulkGet: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('../hooks/useCollections', () => ({
  COLLECTIONS_LOAD_FAILED_MESSAGE: 'load failed',
  useCollections: () => ({
    collections: mocks.collections,
    loading: mocks.loading,
    error: mocks.error,
    retry: mocks.retry,
    renameCollection: mocks.rename,
    deleteCollection: mocks.del,
    removeFromCollection: mocks.remove,
  }),
}));
vi.mock('../hooks/useSavedFavorites', () => ({ fetchFavoriteCached: (id: string) => mocks.fetch(id) }));
vi.mock('../db/database', () => ({ db: { recipes: { bulkGet: mocks.bulkGet } } }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { CollectionPage } from './CollectionPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  mocks.loading = false;
  mocks.error = null;
  mocks.collections = [{ id: 'c1', name: 'Weeknights', recipeIds: ['a', 'b'] }];
  mocks.rename.mockReset().mockResolvedValue(undefined);
  mocks.del.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.bulkGet.mockReset().mockImplementation(async (ids: string[]) => ids.map((id) => (id === 'a' ? { id, title: 'Dal', emoji: '🍲', totalTime: 30 } : undefined)));
  mocks.fetch.mockReset().mockResolvedValue({ status: 'missing' });
});

// Stands in for the recipe route and shows the list origin the link carried (RL-225).
function Origin() {
  return <p data-testid="origin">{(useLocation().state as { listOrigin?: string } | null)?.listOrigin}</p>;
}
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
const show = () =>
  renderWithProviders(
    <Routes>
      <Route path="/kitchen/c/:id" element={<CollectionPage />} />
      <Route path="/kitchen" element={<Where />} />
      <Route path="/recipe/:id" element={<Origin />} />
    </Routes>,
    { route: '/kitchen/c/c1' }
  );

describe('CollectionPage (RL-224)', () => {
  it('shows the name, count and tiles, reading only missing ids from the cloud', async () => {
    show();
    expect(screen.getByRole('heading', { name: 'Weeknights' })).toBeInTheDocument();
    expect(screen.getByText('2 recipes')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Dal/ })).toHaveAttribute('href', '/recipe/a');
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    expect(mocks.fetch).toHaveBeenCalledWith('b');
  });

  it('opens a tile with the collection as its origin', async () => {
    show();
    fireEvent.click(await screen.findByRole('link', { name: /Dal/ }));
    expect(screen.getByTestId('origin')).toHaveTextContent('/kitchen/c/c1');
  });

  it('shows a missing recipe as A deleted recipe, removable in edit mode', async () => {
    show();
    expect(await screen.findByText('A deleted recipe')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Remove Dal' })).toHaveClass('size-11');
    fireEvent.click(screen.getByRole('button', { name: 'Remove deleted recipe 2 of 2' }));
    expect(mocks.remove).toHaveBeenCalledWith('c1', 'b');
    // Last tile removed: focus moves to the previous tile's remove button.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Dal' })).toHaveFocus());
  });

  it('shows a failed read as a retryable tile, not a deleted recipe', async () => {
    mocks.fetch.mockResolvedValueOnce({ status: 'failed' }).mockResolvedValue({ status: 'recipe', recipe: { title: 'Rice', emoji: '🍚', totalTime: 0 } });
    show();
    expect(await screen.findByText("Couldn't load this recipe")).toBeInTheDocument();
    expect(screen.queryByText('A deleted recipe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /Rice/ })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('locks the remove buttons while a removal is in flight', async () => {
    let done!: () => void;
    mocks.remove.mockReturnValue(new Promise<void>((r) => (done = r)));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dal' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Dal' })).toBeDisabled());
    done();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Dal' })).toBeEnabled());
  });

  it('renames through the More sheet', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Collection name'), { target: { value: 'Dinners' } });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith('c1', 'Dinners'));
  });

  it('deletes after the confirm, then returns to Kitchen', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete Weeknights?')).toBeInTheDocument();
    expect(screen.getByText('The recipes stay saved.')).toBeInTheDocument();
    expect(mocks.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('c1'));
    expect(await screen.findByTestId('where')).toHaveTextContent('/kitchen');
  });

  it('pages cloud reads 24 at a time', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `x${i}`);
    mocks.collections = [{ id: 'c1', name: 'Big', recipeIds: ids }];
    show();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(24));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(30));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('shows an empty state with a way back when the collection is gone', () => {
    mocks.collections = [];
    show();
    expect(screen.getByText('This collection is gone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Kitchen' })).toHaveAttribute('href', '/kitchen');
  });

  it('shows a skeleton while loading and asks guests to sign in', () => {
    mocks.loading = true;
    const a = show();
    expect(screen.getByRole('status', { name: 'Loading collection' })).toBeInTheDocument();
    a.unmount();
    renderWithProviders(<CollectionPage />, { user: null });
    expect(screen.getByText('Sign in to use collections')).toBeInTheDocument();
  });
});
