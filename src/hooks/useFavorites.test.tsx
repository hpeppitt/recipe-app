// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { db } from '../db/database';
import type { AppUser } from '../types/recipe';

const addCloud = vi.fn(async (..._a: unknown[]) => {});
const isCloud = vi.fn(async (..._a: unknown[]) => false);
const removeCloud = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../services/firestore', () => ({
  addCloudFavorite: (...a: unknown[]) => addCloud(...a),
  removeCloudFavorite: (...a: unknown[]) => removeCloud(...a),
  isCloudFavorite: (...a: unknown[]) => isCloud(...a),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackFavoriteToggled: vi.fn() }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useFavorite, useCloudFavorite, useFavoriteIds } from './useFavorites';

const noop = async () => {};
function wrapperFor(user: AppUser | null) {
  const value = {
    user, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop,
    linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' },
    submitLinkEmail: noop, dismissLinkState: () => {},
  } as AuthContextType;
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
const anon: AppUser = { uid: 'anon-1', displayName: 'CrispyWaffle', email: null, isAnonymous: true, emailVerified: false };
const meta = { ownerId: 'owner', title: 'Soup', emoji: '🍲' };

describe('useFavorite', () => {
  beforeEach(async () => {
    addCloud.mockClear();
    removeCloud.mockClear();
    await db.favorites.clear();
  });

  it('keeps an anonymous bookmark in Dexie only', async () => {
    const { result } = renderHook(() => useFavorite('r1'), { wrapper: wrapperFor(anon) });
    await act(() => result.current.toggleFavorite(meta));
    expect(await db.favorites.get(['anon-1', 'r1'])).toBeTruthy();
    await waitFor(() => expect(result.current.isFavorite).toBe(true));

    await act(() => result.current.toggleFavorite(meta));
    expect(await db.favorites.get(['anon-1', 'r1'])).toBeUndefined();
    expect(addCloud).not.toHaveBeenCalled();
    expect(removeCloud).not.toHaveBeenCalled();
  });

  it('keeps the dual write for a verified account', async () => {
    const { result } = renderHook(() => useFavorite('r1'), { wrapper: wrapperFor(fakeUser) });
    await act(() => result.current.toggleFavorite(meta));
    expect(await db.favorites.get([fakeUser.uid, 'r1'])).toBeTruthy();
    expect(addCloud).toHaveBeenCalledWith(fakeUser.uid, 'r1', 'owner', 'Soup', '🍲', fakeUser.displayName);
    await waitFor(() => expect(result.current.isFavorite).toBe(true));

    await act(() => result.current.toggleFavorite(meta));
    expect(removeCloud).toHaveBeenCalledWith(fakeUser.uid, 'r1');
  });
});

describe('useCloudFavorite', () => {
  it('never writes for an anonymous account', async () => {
    addCloud.mockClear();
    const { result } = renderHook(() => useCloudFavorite('r1'), { wrapper: wrapperFor(anon) });
    await act(() => result.current.toggleFavorite(meta));
    expect(addCloud).not.toHaveBeenCalled();
  });
});

describe('useCloudFavorite hygiene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCloud.mockResolvedValue(false);
  });

  it('ignores a late lookup for the previous recipe', async () => {
    let resolveA!: (v: boolean) => void;
    isCloud.mockImplementation((_u: unknown, r: unknown) =>
      r === 'A' ? new Promise<boolean>((res) => (resolveA = res)) : Promise.resolve(false)
    );
    const { result, rerender } = renderHook(({ id }) => useCloudFavorite(id), {
      wrapper: wrapperFor(fakeUser),
      initialProps: { id: 'A' },
    });
    rerender({ id: 'B' });
    await waitFor(() => expect(isCloud).toHaveBeenCalledWith(fakeUser.uid, 'B'));
    await act(async () => resolveA(true));
    expect(result.current.isFavorite).toBe(false);
  });

  it('reports a lookup failure and settles as not favourited', async () => {
    isCloud.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCloudFavorite('A'), { wrapper: wrapperFor(fakeUser) });
    await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'favorite-lookup'));
    expect(result.current.isFavorite).toBe(false);
  });

  it('keeps state on a failed toggle, sets the error, clears it on the next toggle and on id change', async () => {
    const { result, rerender } = renderHook(({ id }) => useCloudFavorite(id), {
      wrapper: wrapperFor(fakeUser),
      initialProps: { id: 'A' },
    });
    addCloud.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.toggleFavorite(meta));
    expect(result.current.isFavorite).toBe(false);
    expect(result.current.error).toMatch(/Couldn't update that/);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'favorite');

    await act(() => result.current.toggleFavorite(meta));
    expect(result.current.error).toBeNull();
    expect(result.current.isFavorite).toBe(true);

    removeCloud.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.toggleFavorite(meta));
    expect(result.current.isFavorite).toBe(true);
    expect(result.current.error).not.toBeNull();
    rerender({ id: 'B' });
    expect(result.current.error).toBeNull();
  });
});

describe('useFavoriteIds', () => {
  it('returns the same Set while the favourites array is unchanged', async () => {
    await db.favorites.clear();
    await db.favorites.put({ uid: fakeUser.uid, recipeId: 'r1' } as never);
    const { result, rerender } = renderHook(() => useFavoriteIds(), { wrapper: wrapperFor(fakeUser) });
    await waitFor(() => expect(result.current.favoriteIds.has('r1')).toBe(true));
    const first = result.current.favoriteIds;
    rerender();
    expect(result.current.favoriteIds).toBe(first);
  });
});

describe('useCloudFavorite toggle races and timeouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCloud.mockResolvedValue(false);
  });

  it('a toggle that resolves after the id changed does not overwrite the new id lookup', async () => {
    let finish!: () => void;
    addCloud.mockReturnValueOnce(new Promise<void>((r) => (finish = r)));
    isCloud.mockImplementation(async (_u: unknown, r: unknown) => r === 'B');
    const { result, rerender } = renderHook(({ id }) => useCloudFavorite(id), {
      wrapper: wrapperFor(fakeUser),
      initialProps: { id: 'A' },
    });
    await waitFor(() => expect(isCloud).toHaveBeenCalledWith(fakeUser.uid, 'A'));
    let p!: Promise<void>;
    act(() => { p = result.current.toggleFavorite(meta); });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.isFavorite).toBe(true));
    await act(async () => { finish(); await p; });
    expect(result.current.isFavorite).toBe(true);
  });

  it('times out a write that never resolves, then a second tap works', async () => {
    vi.useFakeTimers();
    try {
      addCloud.mockReturnValueOnce(new Promise(() => {}));
      const { result } = renderHook(() => useCloudFavorite('A'), { wrapper: wrapperFor(fakeUser) });
      let p!: Promise<void>;
      act(() => { p = result.current.toggleFavorite(meta); });
      await act(async () => { await vi.advanceTimersByTimeAsync(5001); await p; });
      expect(result.current.isFavorite).toBe(false);
      expect(result.current.error).toMatch(/Couldn't update that/);
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'favorite');

      await act(() => result.current.toggleFavorite(meta));
      expect(result.current.isFavorite).toBe(true);
      expect(result.current.error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
