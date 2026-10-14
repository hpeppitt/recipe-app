// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { db } from '../db/database';
import type { AppUser } from '../types/recipe';

const addCloud = vi.fn(async (..._a: unknown[]) => {});
const removeCloud = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../services/firestore', () => ({
  addCloudFavorite: (...a: unknown[]) => addCloud(...a),
  removeCloudFavorite: (...a: unknown[]) => removeCloud(...a),
  isCloudFavorite: vi.fn(async () => false),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackFavoriteToggled: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { useFavorite, useCloudFavorite } from './useFavorites';

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
