// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { makeIngredient, makeRecipe } from '../test/factories';
import { KitchenFullError, type KitchenLists } from '../lib/kitchen';
import type { AppUser } from '../types/recipe';

const subscribeKitchen = vi.fn();
const updateKitchen = vi.fn();
const unsubscribe = vi.fn();
vi.mock('../services/firestore', () => ({
  subscribeKitchen: (...a: unknown[]) => subscribeKitchen(...a),
  updateKitchen: (...a: unknown[]) => updateKitchen(...a),
}));
const getIdToken = vi.fn(async () => 'token');
vi.mock('../services/firebase', () => ({ auth: { currentUser: { getIdToken: (...a: unknown[]) => getIdToken(...(a as [])) } } }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { KITCHEN_BUSY_MESSAGE, KITCHEN_FAILED_MESSAGE, KITCHEN_FULL_MESSAGE, KITCHEN_MAYBE_SAVED_MESSAGE, KITCHEN_RETRY_MS, useKitchen, addRecipeToKitchen } from './useKitchen';

const wrapperFor = (user: AppUser | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={{ user, isLoading: false, isConfigured: true } as AuthContextType}>
        {children}
      </AuthContext.Provider>
    );
  };

let lists: KitchenLists = { shopping: [], pantry: [] };
beforeEach(() => {
  vi.clearAllMocks();
  lists = { shopping: [], pantry: [] };
  subscribeKitchen.mockImplementation((_id: string, next: (k: unknown) => void) => {
    next(null);
    return unsubscribe;
  });
  // Applies the mutation to `lists`, as the transaction would to the stored document.
  updateKitchen.mockImplementation(async (_id: string, fn: (k: KitchenLists) => KitchenLists) => {
    lists = fn(lists);
  });
});
afterEach(() => vi.spyOn(navigator, 'onLine', 'get').mockRestore());

describe('useKitchen', () => {
  it('opens one listener on kitchens/{uid} however many components call it, and closes it after the last', () => {
    const wrapper = wrapperFor(fakeUser);
    const a = renderHook(() => useKitchen(), { wrapper });
    const b = renderHook(() => useKitchen(), { wrapper });
    expect(subscribeKitchen).toHaveBeenCalledTimes(1);
    expect(subscribeKitchen).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function), expect.any(Function));
    expect(b.result.current.kitchen).toEqual({ memberUids: [fakeUser.uid], ownerUid: fakeUser.uid, shopping: [], pantry: [], updatedAt: null });
    expect(b.result.current.loading).toBe(false);
    a.unmount();
    expect(unsubscribe).not.toHaveBeenCalled();
    b.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['signed out', null],
    ['unverified', { ...fakeUser, emailVerified: false }],
    ['anonymous', { ...fakeUser, isAnonymous: true }],
  ])('returns kitchen null without reading when %s', (_label, user) => {
    const { result } = renderHook(() => useKitchen(), { wrapper: wrapperFor(user) });
    expect(subscribeKitchen).not.toHaveBeenCalled();
    expect(result.current.kitchen).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('runs each mutation through updateKitchen with the RL-212 helpers', async () => {
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    const recipe = makeRecipe({ id: 'r1', servings: 2, ingredients: [makeIngredient('onion'), makeIngredient('rice')] });
    await act(() => result.current.addRecipe(recipe, 4));
    expect(updateKitchen).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function));
    expect(lists.shopping.length).toBeGreaterThan(0);
    const first = lists.shopping[0];

    await act(() => result.current.toggleLine(first.id, true));
    await act(() => result.current.toggleLine(first.id, true));
    expect(lists.shopping[0].done).toBe(true);

    await act(() => result.current.addPantry('  Salt  '));
    await act(() => result.current.addPantry('salt'));
    expect(lists.pantry.map((p) => [p.name, p.group, p.addedBy])).toEqual([['Salt', 'cupboard', fakeUser.uid]]);
    await act(() => result.current.removePantry(lists.pantry[0].id));
    expect(lists.pantry).toEqual([]);

    await act(() => result.current.boughtItAll());
    expect(lists.shopping).toEqual([]);
    expect(lists.pantry.length).toBeGreaterThan(0);

    await act(() => result.current.addRecipe(recipe, 2));
    await act(() => result.current.removeSource('r1'));
    expect(lists.shopping).toEqual([]);
    unmount();
  });

  it('shows the full copy when a write would pass a cap', async () => {
    updateKitchen.mockRejectedValue(new KitchenFullError());
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_FULL_MESSAGE));
    expect(result.current.error).toBe(KITCHEN_FULL_MESSAGE);
    expect(reportError).not.toHaveBeenCalled();
    unmount();
  });

  it('fails offline without trying to write, and clears the error after a good write', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_FAILED_MESSAGE));
    expect(updateKitchen).not.toHaveBeenCalled();
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    onLine.mockReturnValue(true);
    await act(() => result.current.addPantry('salt'));
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('shows the failed copy and reports a failed write', async () => {
    updateKitchen.mockRejectedValue(new Error('permission-denied'));
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_FAILED_MESSAGE));
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-write');
    unmount();
  });

  it('says it may have saved when the write timed out', async () => {
    updateKitchen.mockRejectedValue(new Error('Updating the kitchen timed out'));
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_MAYBE_SAVED_MESSAGE));
    expect(result.current.error).toBe(KITCHEN_MAYBE_SAVED_MESSAGE);
    unmount();
  });

  it('drops a second call while a write is in flight, so a double addRecipe applies once', async () => {
    let release!: () => void;
    updateKitchen.mockImplementation(async (_id: string, fn: (k: KitchenLists) => KitchenLists) => {
      await new Promise<void>((r) => (release = r));
      lists = fn(lists);
    });
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    const recipe = makeRecipe({ id: 'r1', servings: 2, ingredients: [makeIngredient('onion')] });
    await act(async () => {
      const a = result.current.addRecipe(recipe, 2);
      const b = result.current.addRecipe(recipe, 2);
      release();
      await Promise.all([a, b]);
    });
    expect(updateKitchen).toHaveBeenCalledTimes(1);
    expect(lists.shopping).toHaveLength(1);
    expect(lists.shopping[0].amount).toBe(1);
    unmount();
  });

  it('shows null on a failed first read, refreshes the token on permission-denied and resubscribes once', async () => {
    vi.useFakeTimers();
    subscribeKitchen
      .mockImplementationOnce((_id: string, _next: unknown, error: (e: unknown) => void) => {
        error(Object.assign(new Error('denied'), { code: 'permission-denied' }));
        return unsubscribe;
      })
      .mockImplementationOnce((_id: string, next: (k: unknown) => void) => {
        next(null);
        return unsubscribe;
      });
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    expect(result.current.kitchen).toBeNull();
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-listener');
    await act(() => vi.advanceTimersByTimeAsync(KITCHEN_RETRY_MS));
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(subscribeKitchen).toHaveBeenCalledTimes(2);
    expect(result.current.kitchen?.shopping).toEqual([]);
    expect(result.current.error).toBeNull();
    unmount();
    vi.useRealTimers();
  });

  it('addRecipeToKitchen counts lines not in the pantry and never opens the listener', async () => {
    lists = { shopping: [], pantry: [{ id: 'p1', name: 'rice', group: 'cupboard', addedBy: 'u', addedAt: 0 }] } as unknown as KitchenLists;
    const recipe = makeRecipe({ id: 'r1', ingredients: [makeIngredient('onion'), makeIngredient('rice')] });
    await expect(addRecipeToKitchen(fakeUser.uid, recipe, recipe.servings)).resolves.toBe(1);
    expect(lists.shopping).toHaveLength(2);
    expect(subscribeKitchen).not.toHaveBeenCalled();
  });

  it('addRecipeToKitchen rejects instead of reporting success when another write is running', async () => {
    let release!: () => void;
    updateKitchen.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const { result } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggleLine('x', true);
    });
    await expect(addRecipeToKitchen(fakeUser.uid, makeRecipe({ id: 'r2' }), 2)).rejects.toThrow(KITCHEN_BUSY_MESSAGE);
    await act(async () => {
      release();
      await first;
    });
  });
});
