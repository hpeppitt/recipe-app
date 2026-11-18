// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stand-ins for the Auth SDK, as in firebase.google.test.ts (RL-057, TASK-149.2).
type FakeUser = {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  providerData: Array<{ providerId: string }>;
  getIdTokenResult: () => Promise<{ authTime: string }>;
};
const fakeAuth: { currentUser: FakeUser | null } = { currentUser: null };
const reauthenticateWithPopup = vi.fn();
const deleteUser = vi.fn();
const sendSignInLinkToEmail = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), connectFirestoreEmulator: vi.fn() }));
vi.mock('firebase/app-check', () => ({ initializeAppCheck: vi.fn(), ReCaptchaV3Provider: vi.fn() }));
vi.mock('firebase/auth', () => ({
  getAuth: () => fakeAuth,
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: function GoogleAuthProvider() {},
  reauthenticateWithPopup: (...a: unknown[]) => reauthenticateWithPopup(...a),
  deleteUser: (...a: unknown[]) => deleteUser(...a),
  sendSignInLinkToEmail: (...a: unknown[]) => sendSignInLinkToEmail(...a),
}));

const authError = (code: string) => Object.assign(new Error(code), { code });
const user = (over: Partial<FakeUser> = {}): FakeUser => ({
  uid: 'u1',
  isAnonymous: false,
  email: 'a@example.com',
  providerData: [{ providerId: 'password' }],
  getIdTokenResult: async () => ({ authTime: 'Wed, 18 Nov 2026 07:00:00 GMT' }),
  ...over,
});

async function load() {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'k');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'd');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'p');
  vi.resetModules();
  return import('./firebase');
}

beforeEach(() => {
  fakeAuth.currentUser = user();
  for (const f of [reauthenticateWithPopup, deleteUser, sendSignInLinkToEmail]) f.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('getAuthTimeMs', () => {
  it('reads auth_time from the token, and is null when it cannot', async () => {
    const { getAuthTimeMs } = await load();
    expect(await getAuthTimeMs()).toBe(Date.parse('2026-11-18T07:00:00Z'));
    fakeAuth.currentUser = user({ getIdTokenResult: () => Promise.reject(authError('auth/network-request-failed')) });
    expect(await getAuthTimeMs()).toBeNull();
    fakeAuth.currentUser = null;
    expect(await getAuthTimeMs()).toBeNull();
  });
});

describe('reauthMethod', () => {
  it('picks Google when linked, else email, and nothing for a guest', async () => {
    const { reauthMethod } = await load();
    expect(reauthMethod()).toBe('email');
    fakeAuth.currentUser = user({ providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] });
    expect(reauthMethod()).toBe('google');
    fakeAuth.currentUser = user({ isAnonymous: true, email: null, providerData: [] });
    expect(reauthMethod()).toBeNull();
  });
});

describe('reauthenticateWithGoogle', () => {
  it('reports ok, cancelled and blocked, and rethrows anything else', async () => {
    const { reauthenticateWithGoogle } = await load();
    reauthenticateWithPopup.mockResolvedValueOnce({});
    expect(await reauthenticateWithGoogle()).toBe('ok');
    expect(reauthenticateWithPopup.mock.calls[0][0]).toBe(fakeAuth.currentUser);
    reauthenticateWithPopup.mockRejectedValueOnce(authError('auth/popup-closed-by-user'));
    expect(await reauthenticateWithGoogle()).toBe('cancelled');
    reauthenticateWithPopup.mockRejectedValueOnce(authError('auth/popup-blocked'));
    expect(await reauthenticateWithGoogle()).toBe('blocked');
    reauthenticateWithPopup.mockRejectedValueOnce(authError('auth/user-mismatch'));
    await expect(reauthenticateWithGoogle()).rejects.toMatchObject({ code: 'auth/user-mismatch' });
  });
});

describe('sendReauthEmailLink', () => {
  it('sends a sign-in link to the own address of the account', async () => {
    const { sendReauthEmailLink } = await load();
    sendSignInLinkToEmail.mockResolvedValue(undefined);
    await sendReauthEmailLink();
    expect(sendSignInLinkToEmail.mock.calls[0][1]).toBe('a@example.com');
    expect(localStorage.getItem('emailForSignIn')).toBe('a@example.com');
    fakeAuth.currentUser = user({ email: null });
    await expect(sendReauthEmailLink()).rejects.toThrow();
  });
});

describe('deleteAuthUser', () => {
  it('maps requires-recent-login to needs-reauth and other errors to failed', async () => {
    const { deleteAuthUser } = await load();
    deleteUser.mockResolvedValueOnce(undefined);
    expect(await deleteAuthUser()).toBe('deleted');
    deleteUser.mockRejectedValueOnce(authError('auth/requires-recent-login'));
    expect(await deleteAuthUser()).toBe('needs-reauth');
    deleteUser.mockRejectedValueOnce(authError('auth/network-request-failed'));
    expect(await deleteAuthUser()).toBe('failed');
    fakeAuth.currentUser = null;
    expect(await deleteAuthUser()).toBe('failed');
  });

  it('cannot hang', async () => {
    const { deleteAuthUser } = await load();
    vi.useFakeTimers();
    deleteUser.mockReturnValueOnce(new Promise(() => {}));
    const pending = deleteAuthUser();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toBe('failed');
  });
});
