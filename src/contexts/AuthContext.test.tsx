// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

type FakeUser = { uid: string; displayName: string | null; email: string | null; isAnonymous: boolean; emailVerified: boolean };

let authListener: (u: FakeUser | null) => void = () => {};
const completeEmailSignIn = vi.fn();
const signInAnonymously = vi.fn();
vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: true,
  auth: { currentUser: null },
  onAuthStateChanged: (cb: (u: FakeUser | null) => void) => {
    authListener = cb;
    return () => {};
  },
  signInAnonymously: () => signInAnonymously(),
  sendEmailSignInLink: vi.fn(),
  sendEmailLinkForLinking: vi.fn(),
  completeEmailSignIn: (...a: unknown[]) => completeEmailSignIn(...a),
  isEmailLinkLanding: () => false,
  EmailLinkError: class extends Error {},
  setDisplayName: vi.fn(async () => {}),
  signOut: vi.fn(),
}));
const createOrUpdateProfile = vi.fn(async (..._a: unknown[]) => {});
const order: string[] = [];
const pushLocalFavoritesToCloud = vi.fn(async (uid: string) => {
  order.push(`push:${uid}`);
  return { attempted: 0, pushed: 0, skipped: 0 };
});
vi.mock('../services/firestore', () => ({
  createOrUpdateProfile: (...a: unknown[]) => createOrUpdateProfile(...a),
  pushLocalFavoritesToCloud: (uid: string) => pushLocalFavoritesToCloud(uid),
  migrateFirestoreUid: vi.fn(async () => ({ ok: true, strandedRecipes: 0 })),
}));
vi.mock('../services/storage', () => ({
  getAnonymousUid: () => null,
  setAnonymousUid: vi.fn(),
  clearAnonymousUid: vi.fn(),
  addPreviousUid: vi.fn(),
  getDeviceId: vi.fn(),
  setStrandedIdentity: vi.fn(),
}));
vi.mock('../services/analytics', () => ({
  trackSignIn: vi.fn(),
  trackSignOut: vi.fn(),
  setAnalyticsUserId: vi.fn(),
}));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('../db/recipes', () => ({ migrateRecipesUid: vi.fn() }));
vi.mock('../db/favorites', () => ({
  migrateFavoritesUid: vi.fn(async (from: string, to: string) => {
    await Promise.resolve();
    order.push(`migrate:${from}->${to}`);
    return 0;
  }),
}));

import { AuthProvider, useAuth } from './AuthContext';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const anon: FakeUser = { uid: 'anon-1', displayName: 'CrispyWaffle', email: null, isAnonymous: true, emailVerified: false };
const verified: FakeUser = { uid: 'me', displayName: 'Cook', email: 'c@example.com', isAnonymous: false, emailVerified: true };

describe('AuthProvider profile creation', () => {
  beforeEach(() => {
    createOrUpdateProfile.mockClear();
    completeEmailSignIn.mockReset();
    completeEmailSignIn.mockResolvedValue(null);
  });

  it('creates no profile for an anonymous user on auth change', async () => {
    renderHook(() => useAuth(), { wrapper });
    act(() => authListener(anon));
    await waitFor(() => expect(completeEmailSignIn).toHaveBeenCalled());
    expect(createOrUpdateProfile).not.toHaveBeenCalled();
  });

  it('ensures the profile for a verified user on auth change', () => {
    renderHook(() => useAuth(), { wrapper });
    act(() => authListener(verified));
    expect(createOrUpdateProfile).toHaveBeenCalledWith('me', { displayName: 'Cook' });
  });

  it('creates no profile on anonymous sign-in and keeps the generated name', async () => {
    signInAnonymously.mockResolvedValue({ user: { ...anon, displayName: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signInAnonymously());
    expect(result.current.user?.displayName).toBeTruthy();
    expect(createOrUpdateProfile).not.toHaveBeenCalled();
  });

  it('creates the profile when an anonymous account is upgraded by email link', async () => {
    // Linking keeps the uid, so Firebase does not fire onAuthStateChanged again.
    let resolveLink: (r: unknown) => void = () => {};
    completeEmailSignIn.mockReturnValue(new Promise((r) => (resolveLink = r)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => authListener(anon));
    expect(createOrUpdateProfile).not.toHaveBeenCalled();

    const upgraded = { ...anon, email: 'a@example.com', isAnonymous: false, emailVerified: true };
    await act(async () => resolveLink({ user: upgraded, previousUid: null, linked: true }));

    expect(createOrUpdateProfile).toHaveBeenCalledWith('anon-1', { displayName: 'CrispyWaffle' });
    expect(result.current.user).toMatchObject({ uid: 'anon-1', emailVerified: true, isAnonymous: false });
  });
});

describe('AuthProvider favourites carry-over (RL-034)', () => {
  beforeEach(() => {
    order.length = 0;
    pushLocalFavoritesToCloud.mockClear();
    reportError.mockClear();
    completeEmailSignIn.mockReset();
    completeEmailSignIn.mockResolvedValue(null);
  });

  const upgraded = { ...anon, email: 'a@example.com', isAnonymous: false, emailVerified: true };

  it('pushes once after a linked upgrade', async () => {
    completeEmailSignIn.mockResolvedValue({ user: upgraded, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => authListener(anon));
    await waitFor(() => expect(result.current.linkState).toEqual({ status: 'done', linked: true }));

    expect(pushLocalFavoritesToCloud).toHaveBeenCalledTimes(1);
    expect(pushLocalFavoritesToCloud).toHaveBeenCalledWith('anon-1');
  });

  it('pushes once after an existing-account upgrade, after the Dexie migration', async () => {
    completeEmailSignIn.mockResolvedValue({ user: verified, previousUid: 'anon-1', linked: false });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.linkState).toEqual({ status: 'done', linked: false }));

    expect(pushLocalFavoritesToCloud).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['migrate:anon-1->me', 'push:me']);
  });

  it('does not push on an ordinary verified sign-in', async () => {
    renderHook(() => useAuth(), { wrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(completeEmailSignIn).toHaveBeenCalled());
    await act(async () => {});

    expect(pushLocalFavoritesToCloud).not.toHaveBeenCalled();
  });

  it('does not push for an unverified result', async () => {
    completeEmailSignIn.mockResolvedValue({ user: { ...upgraded, emailVerified: false }, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.linkState.status).toBe('done'));

    expect(pushLocalFavoritesToCloud).not.toHaveBeenCalled();
  });

  it('reports a partial push once and still completes the upgrade', async () => {
    pushLocalFavoritesToCloud.mockResolvedValueOnce({ attempted: 3, pushed: 1, skipped: 2 });
    completeEmailSignIn.mockResolvedValue({ user: upgraded, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));

    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('2 of 3') }), 'favorites-upgrade');
    expect(result.current.linkState).toEqual({ status: 'done', linked: true });
    expect(result.current.user).toMatchObject({ uid: 'anon-1', emailVerified: true });
  });

  it('a throwing push does not break the upgrade', async () => {
    pushLocalFavoritesToCloud.mockRejectedValueOnce(new Error('boom'));
    completeEmailSignIn.mockResolvedValue({ user: verified, previousUid: 'anon-1', linked: false });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'favorites-upgrade'));

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(result.current.linkState).toEqual({ status: 'done', linked: false });
  });

  it('logs, but does not report, skips on an existing-account upgrade', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    pushLocalFavoritesToCloud.mockResolvedValueOnce({ attempted: 3, pushed: 1, skipped: 2 });
    completeEmailSignIn.mockResolvedValue({ user: verified, previousUid: 'anon-1', linked: false });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() =>
      expect(logged).toHaveBeenCalledWith('[auth] favourites carry-over', expect.stringContaining('2 of 3'))
    );

    expect(reportError).not.toHaveBeenCalled();
    expect(result.current.linkState).toEqual({ status: 'done', linked: false });
    logged.mockRestore();
  });

  it('reports a throwing push once on the linked path too', async () => {
    pushLocalFavoritesToCloud.mockRejectedValueOnce(new Error('boom'));
    completeEmailSignIn.mockResolvedValue({ user: upgraded, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'favorites-upgrade'));

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(result.current.linkState).toEqual({ status: 'done', linked: true });
  });

  it('logs when an upgraded user is unexpectedly unverified', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    completeEmailSignIn.mockResolvedValue({ user: { ...upgraded, emailVerified: false }, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.linkState.status).toBe('done'));

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('not email-verified'));
    logged.mockRestore();
  });

  it('a second completion for the same uid does not push again', async () => {
    completeEmailSignIn.mockResolvedValue({ user: upgraded, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.linkState.status).toBe('done'));
    await act(() => result.current.submitLinkEmail('a@example.com'));

    expect(completeEmailSignIn).toHaveBeenCalledTimes(2);
    expect(pushLocalFavoritesToCloud).toHaveBeenCalledTimes(1);
  });
});
