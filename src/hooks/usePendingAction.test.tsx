// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { AuthContext, TermsContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { db } from '../db/database';
import type { AppUser } from '../types/recipe';
import { getPendingAction, setPendingAction, claimPendingAction } from '../services/storage';
import { PENDING_ACTION_TTL_MS, type PendingAction } from '../lib/pendingAction';

const addCloud = vi.fn(async (..._a: unknown[]) => {});
const removeCloud = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../services/firestore', () => ({
  getCloudFavorites: vi.fn(async () => []),
  addCloudFavorite: (...a: unknown[]) => addCloud(...a),
  removeCloudFavorite: (...a: unknown[]) => removeCloud(...a),
  isCloudFavorite: vi.fn(async () => false),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackFavoriteToggled: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { usePendingAction } from './usePendingAction';
import { useFavorite } from './useFavorites';

const noop = async () => {};
function wrapperFor({ user = fakeUser, isLoading = false, termsPending = false }: { user?: AppUser | null; isLoading?: boolean; termsPending?: boolean } = {}) {
  const value = {
    user, isLoading, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop,
    linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' },
    submitLinkEmail: noop, dismissLinkState: () => {},
  } as AuthContextType;
  return ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <AuthContext.Provider value={value}>
        <TermsContext.Provider value={{ pending: termsPending, accept: noop, decline: noop }}>{children}</TermsContext.Provider>
      </AuthContext.Provider>
    </StrictMode>
  );
}

/** Stores a save on r1 as this device's link would leave it: sent, then claimed by `by`. */
function storeSave(by = fakeUser.uid, at = Date.now()) {
  setPendingAction({ kind: 'save', recipeId: 'r1' }, at);
  claimPendingAction(by);
}

const isSaveOnR1 = (a: PendingAction) => a.kind === 'save' && a.recipeId === 'r1';
// Lets the effect pass before asserting that nothing ran.
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  // Node's own localStorage global shadows jsdom's and is unusable without a file.
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  addCloud.mockClear();
  removeCloud.mockClear();
  await db.favorites.clear();
});

describe('usePendingAction', () => {
  it('runs a matching action once, under StrictMode, with the stored action already cleared', async () => {
    storeSave();
    const seen: (PendingAction | null)[] = [];
    const run = vi.fn(() => seen.push(getPendingAction()));
    const { rerender } = renderHook(() => usePendingAction(isSaveOnR1, run), { wrapper: wrapperFor() });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'save', recipeId: 'r1' }));
    expect(seen).toEqual([null]);
    rerender();
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['signed out', { user: null }],
    ['unverified', { user: { ...fakeUser, emailVerified: false } }],
    ['auth still loading', { isLoading: true }],
    ['the Terms prompt pending', { termsPending: true }],
  ])('does not run with %s, and keeps the action', async (_name, opts) => {
    storeSave();
    const run = vi.fn();
    renderHook(() => usePendingAction(isSaveOnR1, run), { wrapper: wrapperFor(opts) });
    await settle();
    expect(run).not.toHaveBeenCalled();
    expect(getPendingAction()).not.toBeNull();
  });

  it('does not run an expired action', async () => {
    storeSave(fakeUser.uid, Date.now() - PENDING_ACTION_TTL_MS - 1000);
    const run = vi.fn();
    renderHook(() => usePendingAction(isSaveOnR1, run), { wrapper: wrapperFor() });
    await settle();
    expect(run).not.toHaveBeenCalled();
  });

  it('does not run an action no link claimed, or one claimed by another uid', async () => {
    const run = vi.fn();
    setPendingAction({ kind: 'save', recipeId: 'r1' });
    renderHook(() => usePendingAction(isSaveOnR1, run), { wrapper: wrapperFor() });
    storeSave('someone-else');
    renderHook(() => usePendingAction(isSaveOnR1, run), { wrapper: wrapperFor() });
    await settle();
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves a mismatched action stored for the page it belongs to', async () => {
    setPendingAction({ kind: 'follow', uid: 'u2' });
    claimPendingAction(fakeUser.uid);
    const run = vi.fn();
    renderHook(() => usePendingAction(isSaveOnR1, run), { wrapper: wrapperFor() });
    await settle();
    expect(run).not.toHaveBeenCalled();
    expect(getPendingAction()).toMatchObject({ kind: 'follow', uid: 'u2' });
  });

  it('does not unsave a recipe that is already saved', async () => {
    await db.favorites.put({ uid: fakeUser.uid, recipeId: 'r1', createdAt: 1 } as never);
    storeSave();
    // The recipe page's save: wait for the favourite to be read, then turn it on only if off.
    const { result } = renderHook(
      () => {
        const fav = useFavorite('r1');
        usePendingAction(
          (a) => isSaveOnR1(a) && fav.ready,
          () => {
            if (!fav.isFavorite) void fav.toggleFavorite({ ownerId: 'o', title: 'Soup', emoji: '🍲' });
          }
        );
        return fav;
      },
      { wrapper: wrapperFor() }
    );
    await waitFor(() => expect(getPendingAction()).toBeNull());
    await settle();
    expect(result.current.isFavorite).toBe(true);
    expect(await db.favorites.get([fakeUser.uid, 'r1'])).toBeTruthy();
    expect(removeCloud).not.toHaveBeenCalled();
  });

  it('saves a recipe that is not saved yet', async () => {
    storeSave();
    renderHook(
      () => {
        const fav = useFavorite('r1');
        usePendingAction(
          (a) => isSaveOnR1(a) && fav.ready,
          () => {
            if (!fav.isFavorite) void fav.toggleFavorite({ ownerId: 'o', title: 'Soup', emoji: '🍲' });
          }
        );
      },
      { wrapper: wrapperFor() }
    );
    await waitFor(() => expect(addCloud).toHaveBeenCalledTimes(1));
    expect(await db.favorites.get([fakeUser.uid, 'r1'])).toBeTruthy();
  });
});
