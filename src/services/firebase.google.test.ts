// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stand-ins for the Auth SDK, shaped like what the Auth emulator returns (RL-188).
const fakeAuth: { currentUser: { uid: string; isAnonymous: boolean } | null; authStateReady: () => Promise<void> } = {
  currentUser: null,
  authStateReady: async () => {},
};
const signInWithPopup = vi.fn();
const signInWithRedirect = vi.fn();
const linkWithPopup = vi.fn();
const linkWithRedirect = vi.fn();
const getRedirectResult = vi.fn();
const signInWithCredential = vi.fn();
const credentialFromError = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), connectFirestoreEmulator: vi.fn() }));
vi.mock('firebase/app-check', () => ({ initializeAppCheck: vi.fn(), ReCaptchaV3Provider: vi.fn() }));
vi.mock('firebase/auth', () => ({
  getAuth: () => fakeAuth,
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: Object.assign(function GoogleAuthProvider() {}, {
    credentialFromError: (e: unknown) => credentialFromError(e),
  }),
  signInWithPopup: (...a: unknown[]) => signInWithPopup(...a),
  signInWithRedirect: (...a: unknown[]) => signInWithRedirect(...a),
  linkWithPopup: (...a: unknown[]) => linkWithPopup(...a),
  linkWithRedirect: (...a: unknown[]) => linkWithRedirect(...a),
  getRedirectResult: (...a: unknown[]) => getRedirectResult(...a),
  signInWithCredential: (...a: unknown[]) => signInWithCredential(...a),
}));

const authError = (code: string) => Object.assign(new Error(code), { code });
const guest = { uid: 'anon-1', isAnonymous: true };
const googleUser = { uid: 'g-1', isAnonymous: false };

async function load() {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'k');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'd');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'p');
  vi.resetModules();
  return import('./firebase');
}

describe('signInWithGoogle', () => {
  beforeEach(() => {
    fakeAuth.currentUser = null;
    for (const f of [signInWithPopup, signInWithRedirect, linkWithPopup, linkWithRedirect, getRedirectResult, signInWithCredential, credentialFromError]) {
      f.mockReset();
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('signs a signed-out visitor in with the popup', async () => {
    signInWithPopup.mockResolvedValue({ user: googleUser });
    const { signInWithGoogle } = await load();
    await expect(signInWithGoogle()).resolves.toEqual({ user: googleUser, previousUid: null, linked: false });
    expect(linkWithPopup).not.toHaveBeenCalled();
  });

  it('links a guest with the popup, keeping the uid', async () => {
    fakeAuth.currentUser = guest;
    linkWithPopup.mockResolvedValue({ user: { ...guest, isAnonymous: false } });
    const { signInWithGoogle } = await load();
    await expect(signInWithGoogle()).resolves.toMatchObject({ previousUid: null, linked: true });
    expect(linkWithPopup).toHaveBeenCalledWith(guest, expect.anything());
  });

  it('falls back to a redirect when the popup is blocked', async () => {
    fakeAuth.currentUser = guest;
    linkWithPopup.mockRejectedValue(authError('auth/popup-blocked'));
    linkWithRedirect.mockResolvedValue(undefined);
    const { signInWithGoogle } = await load();
    await expect(signInWithGoogle()).resolves.toBe('redirecting');
    expect(linkWithRedirect).toHaveBeenCalledWith(guest, expect.anything());
  });

  it('goes straight to a redirect in an installed iOS web app', async () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: true });
    signInWithRedirect.mockResolvedValue(undefined);
    const { signInWithGoogle } = await load();
    await signInWithGoogle();
    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it('resolves null when the user closes the popup', async () => {
    signInWithPopup.mockRejectedValue(authError('auth/popup-closed-by-user'));
    const { signInWithGoogle } = await load();
    await expect(signInWithGoogle()).resolves.toBeNull();
  });

  it('signs a guest in to the account that already owns the Google credential, handing back the guest uid', async () => {
    fakeAuth.currentUser = guest;
    const err = authError('auth/credential-already-in-use');
    linkWithPopup.mockRejectedValue(err);
    credentialFromError.mockReturnValue({ providerId: 'google.com' });
    signInWithCredential.mockResolvedValue({ user: googleUser });
    const { signInWithGoogle } = await load();
    await expect(signInWithGoogle()).resolves.toEqual({ user: googleUser, previousUid: 'anon-1', linked: false });
    expect(credentialFromError).toHaveBeenCalledWith(err);
  });

  it('rethrows any other failure', async () => {
    signInWithPopup.mockRejectedValue(authError('auth/internal-error'));
    const { signInWithGoogle } = await load();
    await expect(signInWithGoogle()).rejects.toThrow('auth/internal-error');
  });
});

describe('completeGoogleRedirect', () => {
  beforeEach(() => {
    fakeAuth.currentUser = null;
    getRedirectResult.mockReset();
    signInWithCredential.mockReset();
    credentialFromError.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is null on an ordinary load', async () => {
    getRedirectResult.mockResolvedValue(null);
    const { completeGoogleRedirect } = await load();
    await expect(completeGoogleRedirect()).resolves.toBeNull();
  });

  it('runs once per page load, so a second call shares the first answer', async () => {
    fakeAuth.currentUser = guest;
    getRedirectResult.mockRejectedValueOnce(authError('auth/credential-already-in-use'));
    getRedirectResult.mockRejectedValue(authError('auth/credential-already-in-use'));
    credentialFromError.mockReturnValue({ providerId: 'google.com' });
    signInWithCredential.mockImplementation(async () => {
      fakeAuth.currentUser = googleUser;
      return { user: googleUser };
    });
    const { completeGoogleRedirect } = await load();
    const first = await completeGoogleRedirect();
    await expect(completeGoogleRedirect()).resolves.toBe(first);
    expect(getRedirectResult).toHaveBeenCalledTimes(1);
  });

  it('reports a returned link as linked', async () => {
    getRedirectResult.mockResolvedValue({ user: googleUser, operationType: 'link' });
    const { completeGoogleRedirect } = await load();
    await expect(completeGoogleRedirect()).resolves.toEqual({ user: googleUser, previousUid: null, linked: true });
  });

  it('carries a guest over when the returned credential already has an account', async () => {
    fakeAuth.currentUser = guest;
    getRedirectResult.mockRejectedValue(authError('auth/credential-already-in-use'));
    credentialFromError.mockReturnValue({ providerId: 'google.com' });
    signInWithCredential.mockResolvedValue({ user: googleUser });
    const { completeGoogleRedirect } = await load();
    await expect(completeGoogleRedirect()).resolves.toEqual({ user: googleUser, previousUid: 'anon-1', linked: false });
  });
});
