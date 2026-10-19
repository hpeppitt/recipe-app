// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { db } from '../db/database';

const getPublished = vi.fn(async (..._a: unknown[]): Promise<unknown> => null);
vi.mock('../services/firestore', () => ({ getPublishedRecipe: (...a: unknown[]) => getPublished(...a) }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
// Lets a test shrink the 8 second bound.
let timeoutNow = false;
vi.mock('../lib/utils', async (orig) => {
  const mod = await orig<typeof import('../lib/utils')>();
  return {
    ...mod,
    withTimeout: <T,>(p: Promise<T>, ms: number, fb: T) => mod.withTimeout(p, timeoutNow ? 30 : ms, fb),
  };
});

import { useSavedFavorites, clearSavedFavoritesCache } from './useSavedFavorites';

const noop = async () => {};
function wrapper(over: Partial<AuthContextType> = {}) {
  const value = {
    user: fakeUser, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop,
    linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' },
    submitLinkEmail: noop, dismissLinkState: () => {}, ...over,
  } as AuthContextType;
  return ({ children }: { children: ReactNode }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
const other = { uid: 'chef', displayName: 'Ann' };
const published = (id: string) => ({ ...makeRecipe({ id, createdBy: other }), favoriteCount: 1 });
const addFav = (recipeId: string, createdAt = 1) => db.favorites.add({ uid: fakeUser.uid, recipeId, createdAt });

beforeEach(async () => {
  getPublished.mockReset();
  getPublished.mockResolvedValue(null);
  timeoutNow = false;
  clearSavedFavoritesCache();
  await db.recipes.clear();
  await db.favorites.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('useSavedFavorites', () => {
  it('costs no fetch for a favourite already on the device', async () => {
    await db.recipes.add(makeRecipe({ id: 'loc1', title: 'Local', createdBy: other }));
    await addFav('loc1');
    const { result } = renderHook(() => useSavedFavorites(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['loc1']));
    expect(getPublished).not.toHaveBeenCalled();
  });

  it('fetches a remote favourite once and not again on remount', async () => {
    getPublished.mockResolvedValue(published('rem1'));
    await addFav('rem1');
    const first = renderHook(() => useSavedFavorites(), { wrapper: wrapper() });
    await waitFor(() => expect(first.result.current.rows.map((r) => r.id)).toEqual(['rem1']));
    first.unmount();
    const second = renderHook(() => useSavedFavorites(), { wrapper: wrapper() });
    await waitFor(() => expect(second.result.current.rows.map((r) => r.id)).toEqual(['rem1']));
    expect(getPublished).toHaveBeenCalledTimes(1);
  });

  it('counts a null read as deleted', async () => {
    await addFav('gone1');
    const { result } = renderHook(() => useSavedFavorites(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.deletedCount).toBe(1));
    expect(result.current.rows).toEqual([]);
  });

  it('counts a rejection and a timeout as failed, and retry refetches only those', async () => {
    getPublished.mockImplementation(async (id) => {
      if (id === 'ok1') return published('ok1');
      if (id === 'boom1') throw new Error('nope');
      return new Promise(() => {});
    });
    await addFav('ok1');
    await addFav('boom1');
    await addFav('slow1');
    timeoutNow = true;
    const { result } = renderHook(() => useSavedFavorites(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.failedCount).toBe(2));
    expect(result.current.rows.map((r) => r.id)).toEqual(['ok1']);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'saved-favorite-read');
    getPublished.mockClear();
    act(() => result.current.retry());
    await waitFor(() => expect(getPublished).toHaveBeenCalledTimes(2));
    expect(getPublished.mock.calls.map((c) => c[0]).sort()).toEqual(['boom1', 'slow1']);
  });

  it('fetches nothing offline and reports the rest as offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await addFav('off1');
    const { result } = renderHook(() => useSavedFavorites(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.offlineCount).toBe(1));
    expect(result.current.failedCount).toBe(0);
    expect(getPublished).not.toHaveBeenCalled();
  });

  it('fetches nothing with no uid or when Firebase is not configured', async () => {
    await addFav('nf1');
    const signedOut = renderHook(() => useSavedFavorites(), { wrapper: wrapper({ user: null }) });
    const local = renderHook(() => useSavedFavorites(), { wrapper: wrapper({ isConfigured: false }) });
    await act(async () => {});
    await waitFor(() => expect(signedOut.result.current.isLoading).toBe(false));
    await waitFor(() => expect(local.result.current.isLoading).toBe(false));
    await act(async () => {});
    expect(getPublished).not.toHaveBeenCalled();
  });
});
