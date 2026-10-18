// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { db } from '../db/database';
import { makeRecipe } from '../test/factories';
import type { AppUser } from '../types/recipe';

type Sub = { uid: string; onDocs: (docs: unknown[]) => void; onError: (e: Error) => void; stop: ReturnType<typeof vi.fn> };
const subs: Sub[] = [];
const subscribe = vi.fn((uid: string, onDocs: Sub['onDocs'], onError: Sub['onError']) => {
  const stop = vi.fn();
  subs.push({ uid, onDocs, onError, stop });
  return stop;
});
// Every Firestore write the app has; the sync must call none of them.
const writes = vi.hoisted(() => ({
  publishRecipe: vi.fn(),
  deletePublishedRecipeTree: vi.fn(),
  addCloudFavorite: vi.fn(),
  removeCloudFavorite: vi.fn(),
  pushLocalFavoritesToCloud: vi.fn(),
  createOrUpdateProfile: vi.fn(),
}));
vi.mock('../services/firestore', () => ({
  subscribeOwnRecipes: (...a: unknown[]) => subscribe(...(a as [string, Sub['onDocs'], Sub['onError']])),
  ...writes,
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useOwnRecipesSync, useOwnRecipesSyncStatus } from './useOwnRecipesSync';

const noop = async () => {};
function wrapperFor(getUser: () => AppUser | null, isLoading = false) {
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider
      value={{ user: getUser(), isLoading, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop,
        linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' },
        submitLinkEmail: noop, dismissLinkState: () => {} } as AuthContextType}
    >
      {children}
    </AuthContext.Provider>
  );
}
const useBoth = () => ({ status: useOwnRecipesSyncStatus(), sync: useOwnRecipesSync() });
const doc = (id: string, uid: string) => ({ ...makeRecipe({ id, createdBy: { uid, displayName: null } }) });

beforeEach(async () => {
  subs.length = 0;
  subscribe.mockClear();
  reportError.mockClear();
  Object.values(writes).forEach((w) => w.mockClear());
  await db.recipes.clear();
});

describe('useOwnRecipesSync', () => {
  it.each([
    ['signed out', null, false],
    ['anonymous', { ...fakeUser, isAnonymous: true, emailVerified: false }, false],
    ['unverified', { ...fakeUser, emailVerified: false }, false],
    ['verified while auth is loading', fakeUser, true],
  ])('opens no listener when %s', (_name, user, loading) => {
    const { result } = renderHook(useBoth, { wrapper: wrapperFor(() => user as AppUser | null, loading as boolean) });
    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.status).toBe('off');
  });

  it('mirrors server snapshots into Dexie, reports synced, and never writes to Firestore', async () => {
    await db.recipes.add(doc('gone', fakeUser.uid));
    const { result, unmount } = renderHook(useBoth, { wrapper: wrapperFor(() => fakeUser) });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('waiting');

    act(() => subs[0].onDocs([doc('r1', fakeUser.uid)]));

    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect((await db.recipes.toArray()).map((r) => r.id)).toEqual(['r1']);
    Object.values(writes).forEach((w) => expect(w).not.toHaveBeenCalled());

    unmount();
    expect(subs[0].stop).toHaveBeenCalled();
  });

  it('unsubscribes on sign-out and on a uid change, and a late snapshot for the old uid writes nothing', async () => {
    let user: AppUser | null = fakeUser;
    const { result, rerender } = renderHook(useBoth, { wrapper: wrapperFor(() => user) });
    act(() => subs[0].onDocs([doc('r1', fakeUser.uid)]));
    await waitFor(() => expect(result.current.status).toBe('synced'));

    user = { ...fakeUser, uid: 'other' };
    rerender();
    expect(subs[0].stop).toHaveBeenCalled();
    expect(subs[1].uid).toBe('other');
    expect(result.current.status).toBe('waiting');

    subs[0].onDocs([doc('late', fakeUser.uid)]);
    await new Promise((r) => setTimeout(r, 20));
    expect(await db.recipes.get('late')).toBeUndefined();

    user = null;
    rerender();
    expect(subs[1].stop).toHaveBeenCalled();
    expect(result.current.status).toBe('off');
  });

  it('a listener error is logged, reported once per session, and sets error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(useBoth, { wrapper: wrapperFor(() => fakeUser) });

    act(() => subs[0].onError(new Error('denied')));
    expect(result.current.status).toBe('error');
    unmount();
    renderHook(useBoth, { wrapper: wrapperFor(() => fakeUser) });
    act(() => subs[1].onError(new Error('denied again')));

    expect(log).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'recipe-sync');
    log.mockRestore();
  });

  it('a failed Dexie apply is reported as recipe-sync-local and leaves the status', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const put = vi.spyOn(db.recipes, 'bulkPut').mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(useBoth, { wrapper: wrapperFor(() => fakeUser) });

    act(() => subs[0].onDocs([doc('r1', fakeUser.uid)]));

    await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'recipe-sync-local'));
    expect(result.current.status).toBe('waiting');
    put.mockRestore();
    log.mockRestore();
  });
});
