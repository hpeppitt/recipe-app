// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { db } from '../db/database';
import { makeRecipe } from '../test/factories';
import type { Cook } from '../types/social';

const getProfile = vi.fn();
type P = { avoids: string[]; hidden: string[]; askedAt: number | null };
let server: P = { avoids: [], hidden: [], askedAt: null };
// Applies the updater to the current "server" document after a tick, like the real transaction.
const saveProfile = vi.fn(async (...[, update]: [string, (cur: P) => Partial<P>]) => {
  await new Promise((r) => setTimeout(r, 5));
  server = { ...server, ...update(server) };
  return server;
});
vi.mock('../services/firestore', () => ({
  getTasteProfile: (...a: unknown[]) => getProfile(...a),
  saveTasteProfile: (u: string, f: (cur: P) => Partial<P>) => saveProfile(u, f),
}));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { useTasteProfile, TasteAvoidError } from './useTasteProfile';
import { reportError } from '../services/telemetry';

const noop = async () => {};
const wrap = (user: typeof fakeUser | null) =>
  ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider
      value={{ user, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop, linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' }, submitLinkEmail: noop, dismissLinkState: () => {} } as AuthContextType}
    >
      {children}
    </AuthContext.Provider>
  );

const cook = (recipeId: string, createdAt: number) => ({ id: `${recipeId}${createdAt}`, recipeId, createdAt }) as Cook;
const NO_COOKS: Cook[] = [];

beforeEach(async () => {
  vi.clearAllMocks();
  await db.recipes.clear();
  server = { avoids: ['Nuts'], hidden: [], askedAt: null };
  getProfile.mockImplementation(async () => server);
});

describe('useTasteProfile', () => {
  it('reads nothing for an unverified user and returns empty values', () => {
    const { result } = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap({ ...fakeUser, emailVerified: false }) });
    expect(getProfile).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ avoids: [], cookALot: [], tendToChange: [], askedAt: null, loading: false });
  });

  it('combines the stored avoids with what is learned from cooks and own branches', async () => {
    const mine = { uid: fakeUser.uid, displayName: null };
    await db.recipes.bulkAdd([
      makeRecipe({ id: 'a', title: 'Chicken curry', tags: [], createdBy: { uid: 'someone', displayName: null } }),
      makeRecipe({ id: 'b', title: 'Lamb curry', tags: [], createdBy: { uid: 'someone', displayName: null } }),
      makeRecipe({ id: 'c1', parentId: 'a', prompt: 'make it vegan', createdBy: mine }),
      makeRecipe({ id: 'c2', parentId: 'a', prompt: 'make it vegan', createdBy: mine }),
    ]);
    const cooks = [cook('a', 1), cook('b', 2)];
    const { result } = renderHook(() => useTasteProfile(cooks), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.avoids).toEqual(['Nuts']);
    expect(result.current.cookALot).toEqual(['Curry']);
    expect(result.current.tendToChange).toEqual(['Vegan']);
    expect(result.current.headline).toBe('Learned from 2 cooks and 2 branches.');
  });

  it('keeps both of two quick adds, in order', async () => {
    const { result } = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await Promise.all([result.current.addAvoid('dill'), result.current.addAvoid('mint')]);
    });
    expect(server.avoids).toEqual(['Nuts', 'Dill', 'Mint']);
    expect(result.current.avoids).toEqual(['Nuts', 'Dill', 'Mint']);
  });

  it('refuses a duplicate and a thirteenth avoid with a coded error', async () => {
    const { result } = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.addAvoid(' nuts ')).rejects.toMatchObject({ code: 'duplicate' });
    server.avoids = Array.from({ length: 12 }, (_, i) => `T${i}`);
    getProfile.mockImplementation(async () => server);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.full).toBe(true));
    await expect(result.current.addAvoid('more')).rejects.toBeInstanceOf(TasteAvoidError);
    await expect(result.current.addAvoid('more')).rejects.toMatchObject({ code: 'full' });
  });

  it('hides a term, removes an avoid by its normalised form and records asked', async () => {
    const { result } = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.hideTerm('Curry'));
    expect(server.hidden).toEqual(['Curry']);
    await act(async () => result.current.removeAvoid('  NUTS '));
    expect(server.avoids).toEqual([]);
    await act(async () => result.current.markAsked());
    expect(server.askedAt).toEqual(expect.any(Number));
    await expect(result.current.hideTerm('x'.repeat(41))).rejects.toThrow('too long');
    await act(async () => result.current.unhideTerm(' curry'));
    expect(server.hidden).toEqual([]);
  });

  it('re-reads the server document after a failed write', async () => {
    const { result } = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    saveProfile.mockRejectedValueOnce(new Error('timed out'));
    server = { ...server, avoids: ['Nuts', 'Landed'] };
    await act(async () => {
      await result.current.addAvoid('dill').catch(() => {});
    });
    await waitFor(() => expect(result.current.avoids).toEqual(['Nuts', 'Landed']));
  });

  it('refuses to write after a failed read, and reload recovers', async () => {
    getProfile.mockRejectedValueOnce(new Error('denied'));
    const { result } = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    await expect(result.current.addAvoid('Dill')).rejects.toThrow('has not loaded');
    expect(saveProfile).not.toHaveBeenCalled();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loadFailed).toBe(false));
    expect(result.current.avoids).toEqual(['Nuts']);
  });

  it('reports a failed read but not a permission-denied one; both count as failed (RL-235)', async () => {
    getProfile.mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const denied = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(denied.result.current.loadFailed).toBe(true));
    expect(reportError).not.toHaveBeenCalled();
    denied.unmount();

    getProfile.mockRejectedValueOnce(new Error('timed out'));
    const failed = renderHook(() => useTasteProfile(NO_COOKS), { wrapper: wrap(fakeUser) });
    await waitFor(() => expect(failed.result.current.loadFailed).toBe(true));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'taste-profile');
  });
});
