// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CollectionSheet } from './CollectionSheet';
import { CollectionRefusedError } from '../../lib/kitchen';

const mocks = vi.hoisted(() => ({
  collections: [] as unknown[],
  loading: false,
  error: null as string | null,
  add: vi.fn(),
  create: vi.fn(),
  retry: vi.fn(),
  bulkGet: vi.fn(),
}));
vi.mock('../../hooks/useCollections', () => ({
  COLLECTIONS_LOAD_FAILED_MESSAGE: "Couldn't load your collections. Check your connection and try again.",
  useCollections: () => ({ collections: mocks.collections, loading: mocks.loading, error: mocks.error, retry: mocks.retry, addToCollection: mocks.add, createCollection: mocks.create }),
}));
vi.mock('../../db/database', () => ({ db: { recipes: { bulkGet: mocks.bulkGet } } }));
vi.mock('../../services/telemetry', () => ({ reportError: vi.fn() }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  vi.useFakeTimers();
  mocks.loading = false;
  mocks.error = null;
  mocks.add.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReset().mockResolvedValue('c9');
  mocks.bulkGet.mockReset().mockResolvedValue([{ id: 'a', emoji: '🍜' }, undefined]);
  mocks.collections = [{ id: 'c1', ownerUid: 'u', name: 'Weeknights', recipeIds: ['a', 'b'], createdAt: 1, updatedAt: 1 }];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = (auto = true) => {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <CollectionSheet open auto={auto} recipeId="r1" onClose={onClose} />
    </MemoryRouter>
  );
  return onClose;
};

describe('CollectionSheet', () => {
  it('closes after 6 seconds untouched when a pointer saved', () => {
    const onClose = show();
    act(() => void vi.advanceTimersByTime(5999));
    expect(onClose).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('never closes itself after a keyboard or assistive save, and Not now closes', () => {
    const onClose = show(false);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows skeletons with New collection disabled while loading', () => {
    mocks.loading = true;
    show();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect((screen.getByRole('button', { name: 'New collection' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('stops the timer and disables creation when the listener failed', () => {
    mocks.error = "Couldn't load your collections. Check your connection and try again.";
    const onClose = show();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load");
    expect((screen.getByRole('button', { name: 'New collection' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });

  it('leaves rows and creation usable after a write error, with no Retry', () => {
    mocks.error = "Couldn't update your collections. Check your connection and try again.";
    show();
    expect((screen.getByRole('button', { name: /Add to Weeknights/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'New collection' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('disables a row that already holds the recipe', () => {
    mocks.collections = [{ id: 'c1', ownerUid: 'u', name: 'Weeknights', recipeIds: ['r1'], createdAt: 1, updatedAt: 1 }];
    show();
    expect((screen.getByRole('button', { name: 'Already in Weeknights, 1 recipe' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('stays open for good after any interaction', () => {
    const onClose = show();
    fireEvent.pointerDown(screen.getByRole('heading'));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows rows with a clear name and only New collection when there are none', () => {
    show();
    expect(screen.getByRole('button', { name: 'Add to Weeknights, 2 recipes' })).toBeTruthy();
    cleanup();
    mocks.collections = [];
    show();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.getByRole('button', { name: 'New collection' })).toBeTruthy();
  });

  it('adds to a collection, closes and toasts', async () => {
    const onClose = show();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Add to Weeknights/ })));
    expect(mocks.add).toHaveBeenCalledWith('c1', 'r1');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('Added to Weeknights');
  });

  it('shows the refusal and stays open when the add is refused', async () => {
    mocks.add.mockRejectedValue(new CollectionRefusedError('This collection is full.'));
    const onClose = show();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Add to Weeknights/ })));
    expect(screen.getByRole('alert').textContent).toBe('This collection is full.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('creates a collection holding the recipe, and validates the name', async () => {
    const onClose = show();
    fireEvent.click(screen.getByRole('button', { name: 'New collection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert').textContent).toBe('Give it a name.');
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Collection name'), { target: { value: '  Soups ' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    expect(mocks.create).toHaveBeenCalledWith('Soups', 'r1');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('Added to Soups');
  });
});
