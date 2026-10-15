// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { renderHook, act, waitFor, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TERMS_VERSION } from '../lib/legal';
import { MemoryRouter, Link } from 'react-router-dom';
import { TermsGate } from '../components/auth/TermsUpdateDialog';

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
  signOut: () => fbSignOut(),
}));
const fbSignOut = vi.fn(async () => {});
const createOrUpdateProfile = vi.fn(async (..._a: unknown[]) => {});
const order: string[] = [];
const pushLocalFavoritesToCloud = vi.fn(async (uid: string) => {
  order.push(`push:${uid}`);
  return { attempted: 0, pushed: 0, skipped: 0 };
});
const getAcceptedTermsVersion = vi.fn(async (_uid: string): Promise<string | null> => TERMS_VERSION);
const recordTermsAcceptance = vi.fn(async (uid: string, _acceptedAt: number) => {
  order.push(`terms:${uid}`);
});
vi.mock('../services/firestore', () => ({
  getAcceptedTermsVersion: (uid: string) => getAcceptedTermsVersion(uid),
  recordTermsAcceptance: (uid: string, at: number) => recordTermsAcceptance(uid, at),
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
  getTermsAcceptance: () => storedTerms,
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
  clearTermsAcceptance: () => {
    storedTerms = null;
  },
}));
let storedTerms: { version: string; acceptedAt: number; email: string } | null = null;
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

  it('ensures the profile for a verified user on auth change', async () => {
    renderHook(() => useAuth(), { wrapper });
    act(() => authListener(verified));
    // RL-047: the profile now follows the terms check, so it lands a tick later.
    await waitFor(() => expect(createOrUpdateProfile).toHaveBeenCalledWith('me', { displayName: 'Cook' }));
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

describe('AuthProvider terms acceptance (RL-047)', () => {
  const upgraded = { ...anon, email: 'a@example.com', isAnonymous: false, emailVerified: true };
  const BOX = 'I accept the Terms of Service and have read the Privacy Policy';
  const dialogOpen = () => document.querySelector('dialog')?.hasAttribute('open') ?? false;
  // As in App: the provider outside the router, the gate inside it.
  const at =
    (route = '/') =>
    ({ children }: { children: ReactNode }) => (
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Link to="/">leave</Link>
          {children}
          <TermsGate />
        </MemoryRouter>
      </AuthProvider>
    );
  const termsWrapper = at();
  const entry = (email: string, acceptedAt = 1, version = TERMS_VERSION) => ({ version, acceptedAt, email });

  beforeAll(() => {
    // jsdom has no <dialog> modal support.
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
  });

  beforeEach(() => {
    // No vitest globals, so nothing unmounts earlier providers and their dialogs.
    cleanup();
    order.length = 0;
    storedTerms = null;
    reportError.mockClear();
    recordTermsAcceptance.mockClear();
    fbSignOut.mockReset();
    fbSignOut.mockResolvedValue(undefined);
    getAcceptedTermsVersion.mockReset();
    getAcceptedTermsVersion.mockResolvedValue(null);
    createOrUpdateProfile.mockImplementation(async (uid: unknown) => {
      order.push(`profile:${uid as string}`);
    });
    completeEmailSignIn.mockReset();
    completeEmailSignIn.mockResolvedValue(null);
  });

  afterEach(() => {
    createOrUpdateProfile.mockImplementation(async () => {});
  });

  it('linked upgrade: records the stored acceptance before the profile and the favourites push', async () => {
    storedTerms = entry('A@Example.com', 111);
    completeEmailSignIn.mockResolvedValue({ user: upgraded, previousUid: null, linked: true });
    const { result } = renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(anon));
    await waitFor(() => expect(result.current.linkState).toEqual({ status: 'done', linked: true }));
    await waitFor(() => expect(order).toContain('push:anon-1'));

    expect(recordTermsAcceptance).toHaveBeenCalledTimes(1);
    expect(recordTermsAcceptance).toHaveBeenCalledWith('anon-1', 111);
    expect(order.indexOf('terms:anon-1')).toBe(0);
    expect(order).toContain('profile:anon-1');
    expect(storedTerms).toBeNull();
    expect(dialogOpen()).toBe(false);
  });

  it('existing-account upgrade: one write, before the migration, profile and push', async () => {
    storedTerms = entry('c@example.com', 222);
    completeEmailSignIn.mockResolvedValue({ user: verified, previousUid: 'anon-1', linked: false });
    const { result } = renderHook(() => useAuth(), { wrapper: termsWrapper });
    // Signing into another account changes the uid, so the listener fires as well.
    act(() => authListener(verified));
    await waitFor(() => expect(result.current.linkState).toEqual({ status: 'done', linked: false }));
    await waitFor(() => expect(order).toContain('push:me'));

    expect(recordTermsAcceptance).toHaveBeenCalledTimes(1);
    expect(recordTermsAcceptance).toHaveBeenCalledWith('me', 222);
    expect(order[0]).toBe('terms:me');
    expect(order.indexOf('profile:me')).toBeGreaterThan(0);
  });

  it('ordinary verified sign-in: records before the profile is ensured', async () => {
    storedTerms = entry('c@example.com', 333);
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(order).toEqual(['terms:me', 'profile:me']));
  });

  it('ignores an entry ticked for a different email and shows the dialog', async () => {
    storedTerms = entry('someone-else@example.com', 444);
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(dialogOpen()).toBe(true));
    expect(recordTermsAcceptance).not.toHaveBeenCalled();
  });

  it('skips the write when the current version is already recorded', async () => {
    storedTerms = entry('c@example.com');
    getAcceptedTermsVersion.mockResolvedValue(TERMS_VERSION);
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(order).toEqual(['profile:me']));
    expect(recordTermsAcceptance).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it('asks nothing of an anonymous account', async () => {
    storedTerms = entry('c@example.com');
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(anon));
    await waitFor(() => expect(completeEmailSignIn).toHaveBeenCalled());
    await act(async () => {});

    expect(getAcceptedTermsVersion).not.toHaveBeenCalled();
    expect(recordTermsAcceptance).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it.each([
    ['missing', null, null],
    ['older', '2000-01-01', null],
    ['missing, stored entry is for an older version', null, { version: '2000-01-01', acceptedAt: 1, email: 'c@example.com' }],
  ])('shows the dialog when the record is %s and nothing usable is stored', async (_n, version, stored) => {
    storedTerms = stored;
    getAcceptedTermsVersion.mockResolvedValue(version);
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(dialogOpen()).toBe(true));
    expect(recordTermsAcceptance).not.toHaveBeenCalled();
  });

  it('does not block on a read error: reports once and lets the user continue', async () => {
    storedTerms = entry('c@example.com');
    getAcceptedTermsVersion.mockRejectedValue(new Error('permission-denied'));
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(order).toEqual(['profile:me']));

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'terms-check');
    expect(recordTermsAcceptance).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it('a failed read is not cached: coming back online rechecks and shows the dialog', async () => {
    getAcceptedTermsVersion.mockRejectedValueOnce(new Error('offline'));
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(order).toEqual(['profile:me']));
    expect(dialogOpen()).toBe(false);

    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(dialogOpen()).toBe(true));
    expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(2);
  });

  it('repeated failures report once, and retries stop after three', async () => {
    getAcceptedTermsVersion.mockRejectedValue(new Error('offline'));
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(1));
    await act(async () => {});

    for (let n = 0; n < 5; n++) {
      await act(async () => {
        if (n % 2) window.dispatchEvent(new Event('online'));
        else document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(4);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
  });

  it('a failed write of the stored entry falls back to the dialog and keeps the entry', async () => {
    storedTerms = entry('c@example.com', 5);
    recordTermsAcceptance.mockRejectedValueOnce(new Error('offline'));
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(dialogOpen()).toBe(true));
    expect(storedTerms).toEqual(entry('c@example.com', 5));
  });

  it('Accept records the acceptance and closes; a failure shows Retry and Decline stays available', async () => {
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(dialogOpen()).toBe(true));

    const accept = screen.getByRole('button', { name: 'Accept' });
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    recordTermsAcceptance.mockRejectedValueOnce(new Error('denied'));
    await act(async () => fireEvent.click(accept));

    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't save");
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'terms-accept');
    expect(screen.getByRole('button', { name: 'Decline and sign out' })).toBeEnabled();
    expect(dialogOpen()).toBe(true);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(recordTermsAcceptance).toHaveBeenCalledTimes(2);
    expect(recordTermsAcceptance).toHaveBeenLastCalledWith('me', expect.any(Number));
    await waitFor(() => expect(dialogOpen()).toBe(false));
  });

  it('Decline signs out and clears the stored entry', async () => {
    storedTerms = entry('someone-else@example.com');
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(dialogOpen()).toBe(true));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Decline and sign out' })));
    expect(fbSignOut).toHaveBeenCalledTimes(1);
    expect(storedTerms).toBeNull();

    act(() => authListener(null));
    expect(dialogOpen()).toBe(false);
  });

  it.each([
    ['/terms/', false],
    ['/Terms', false],
    ['/PRIVACY/', false],
    ['/termsx', true],
  ])('on %s the dialog open state is %s', async (route, open) => {
    renderHook(() => useAuth(), { wrapper: at(route) });
    act(() => authListener(verified));
    await waitFor(() => expect(getAcceptedTermsVersion).toHaveBeenCalled());
    await act(async () => {});
    expect(dialogOpen()).toBe(open);
  });

  it('a result that lands after sign-out opens no dialog and arms no retry', async () => {
    let resolveRead: (v: string | null) => void = () => {};
    getAcceptedTermsVersion.mockImplementationOnce(() => new Promise((r) => (resolveRead = r)));
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(1));
    act(() => authListener(null));
    await act(async () => resolveRead(null));
    expect(dialogOpen()).toBe(false);

    act(() => authListener(verified));
    // A fresh sign-in checks again and is asked normally.
    await waitFor(() => expect(dialogOpen()).toBe(true));
    expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(2);
  });

  it('a failure that lands after sign-out arms no retry', async () => {
    let rejectRead: (e: Error) => void = () => {};
    getAcceptedTermsVersion.mockImplementationOnce(() => new Promise((_, r) => (rejectRead = r)));
    renderHook(() => useAuth(), { wrapper: termsWrapper });
    act(() => authListener(verified));
    await waitFor(() => expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(1));
    act(() => authListener(null));
    await act(async () => rejectRead(new Error('offline')));
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(getAcceptedTermsVersion).toHaveBeenCalledTimes(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each(['/terms', '/privacy', '/cookies'])('stays off %s, then shows once the user navigates away', async (route) => {
    renderHook(() => useAuth(), { wrapper: at(route) });
    act(() => authListener(verified));
    await waitFor(() => expect(getAcceptedTermsVersion).toHaveBeenCalled());
    await act(async () => {});
    expect(dialogOpen()).toBe(false);

    fireEvent.click(screen.getByRole('link', { name: 'leave' }));
    expect(dialogOpen()).toBe(true);
  });
});
