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
vi.mock('../services/firestore', () => ({
  createOrUpdateProfile: (...a: unknown[]) => createOrUpdateProfile(...a),
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
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../db/recipes', () => ({ migrateRecipesUid: vi.fn() }));
vi.mock('../db/favorites', () => ({ migrateFavoritesUid: vi.fn() }));

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
