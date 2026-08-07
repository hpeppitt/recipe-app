import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged as fbOnAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  EmailAuthProvider,
  updateProfile,
  signOut as fbSignOut,
  connectAuthEmulator,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getEmailForLinking,
  setEmailForLinking,
  clearEmailForLinking,
} from './storage';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);

  // App Check must be initialised before the first Gemini call: Firebase AI Logic
  // enforces it, and without a token the proxy rejects the request. This is what
  // replaces "protect the site from bots" — it gates the API path itself, which
  // a CDN in front of the site never could.
  if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    // Registered debug token for localhost; without this, enforcement blocks dev.
    if (import.meta.env.DEV) {
      (
        window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN =
        import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

  auth = getAuth(app);
  firestore = getFirestore(app);

  // Point at the local emulator suite when VITE_USE_EMULATORS is set.
  //
  // Exists so features whose data cannot be undone are testable. Suggestions are
  // `allow delete: if false`, so verifying a reply thread against the live project
  // would leave an undeletable record in it permanently. Emulator data is thrown
  // away when the process stops.
  //
  // Double-guarded on `import.meta.env.DEV` as well as the flag: a production
  // build must never be able to redirect writes away from the real project, even
  // if the variable leaks into a build environment.
  if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    console.info('[firebase] using local emulators; no live data is being touched');
  }

  if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    getAnalytics(app);
  }
}

export { app as firebaseApp, auth, firestore, type User };

export function onAuthStateChanged(callback: (user: User | null) => void) {
  if (!auth) return () => {};
  return fbOnAuthStateChanged(auth, callback);
}

export async function signInAnonymously() {
  if (!auth) throw new Error('Firebase not configured');
  return fbSignInAnonymously(auth);
}

export async function sendEmailSignInLink(email: string) {
  if (!auth) throw new Error('Firebase not configured');
  const actionCodeSettings = {
    url: window.location.origin,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  localStorage.setItem('emailForSignIn', email);
}

export async function sendEmailLinkForLinking(email: string) {
  if (!auth) throw new Error('Firebase not configured');
  const actionCodeSettings = {
    url: window.location.origin,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  setEmailForLinking(email);
}

export type EmailLinkResult = {
  user: User;
  previousUid: string | null;
  /** True when the anonymous account was upgraded in place, keeping its uid. */
  linked: boolean;
};

/**
 * Why an email-link sign-in could not be completed.
 *
 * These used to be indistinguishable from "this page load had no link in the
 * URL": every one of them ended as a `null` return or a swallowed throw, so the
 * user clicked their magic link, landed on a signed-out app, and was told
 * nothing at all.
 *
 * - `needs-email`: the link was opened in a different browser or device from the
 *   one that requested it, so the address is not in this browser's storage.
 *   Recoverable: ask for the address and retry. This is the single most common
 *   real-world failure, because mail apps routinely open links in their own
 *   webview.
 * - `expired`: the link is expired or has already been used. Not recoverable;
 *   send a new one.
 * - `email-taken`: the address already belongs to another account, so the
 *   anonymous one cannot be upgraded into it, and the attempt spent the link.
 *   Needs a fresh link, and the user needs to know their anonymous work will not
 *   come with them.
 * - `failed`: anything else.
 */
export type EmailLinkFailure = {
  reason: 'needs-email' | 'expired' | 'email-taken' | 'failed';
  code?: string;
};

export class EmailLinkError extends Error {
  // Assigned in the body rather than as a parameter property: this project sets
  // `erasableSyntaxOnly`, which forbids the shorthand.
  failure: EmailLinkFailure;

  constructor(failure: EmailLinkFailure) {
    super(`Email link sign-in failed: ${failure.reason}`);
    this.name = 'EmailLinkError';
    this.failure = failure;
  }
}

/** True when this page load is a magic-link landing, whatever its outcome. */
export function isEmailLinkLanding(): boolean {
  if (!auth) return false;
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * Strip the sign-in parameters from the URL.
 *
 * Called on failure as well as success. Previously only the success paths did
 * this, so a failed attempt left `oobCode` in the address bar; reloading then
 * retried an already-consumed code and failed again, forever, silently.
 */
function clearLinkFromUrl(): void {
  window.history.replaceState({}, '', window.location.pathname);
}

function classifyLinkError(err: unknown): EmailLinkFailure {
  const code = (err as { code?: string })?.code;
  if (
    code === 'auth/expired-action-code' ||
    code === 'auth/invalid-action-code'
  ) {
    return { reason: 'expired', code };
  }
  return { reason: 'failed', code };
}

/**
 * Complete a magic-link sign-in on page load.
 *
 * Returns `null` when this page load is not a link landing at all, which is the
 * overwhelmingly common case. Throws `EmailLinkError` when it *was* a landing and
 * could not be completed, so the caller can say so instead of leaving the user on
 * a signed-out page wondering what happened.
 *
 * @param emailOverride Address supplied by the user after a `needs-email`
 *   failure, for the cross-device case where this browser never stored it.
 */
export async function completeEmailSignIn(
  emailOverride?: string
): Promise<EmailLinkResult | null> {
  if (!auth) return null;
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;

  // Wait for persistence to be restored before reading currentUser.
  //
  // THIS IS THE LOAD-BEARING LINE. Firebase restores the signed-in user from
  // IndexedDB asynchronously, so on a fresh page load `auth.currentUser` is null
  // for a moment even when a session exists. This function runs from an effect on
  // mount, inside that window. Without the await, the anonymous-upgrade branch
  // below was unreachable: `currentUser` was always null, so every upgrade
  // silently created a *second* account and abandoned the anonymous one, taking
  // its published recipes with it. Verified against the Auth emulator, where the
  // probe read {"currentUser":null,"hasLinkingEmail":true} every time.
  await auth.authStateReady();

  const linkingEmail = getEmailForLinking();
  const signInEmail = localStorage.getItem('emailForSignIn');
  const email = emailOverride?.trim() || linkingEmail || signInEmail;

  const finish = () => {
    clearEmailForLinking();
    localStorage.removeItem('emailForSignIn');
    clearLinkFromUrl();
  };

  // The link was opened somewhere that never stored the address. Recoverable, so
  // the URL is deliberately left intact: the caller prompts for the address and
  // calls back with `emailOverride`, and the code is still needed for that retry.
  if (!email) {
    throw new EmailLinkError({ reason: 'needs-email' });
  }

  const current = auth.currentUser;

  // Anonymous upgrade: attach the email to the existing account so the uid, and
  // therefore everything published under it, survives.
  if (current?.isAnonymous) {
    // Check for an existing account BEFORE attempting to link.
    //
    // This ordering is not optional. A `linkWithCredential` that fails with
    // credential-already-in-use has still consumed the single-use oobCode, so
    // there is no second attempt available: retrying with the link, or even with
    // the same credential object, fails with invalid-action-code and the whole
    // collision reports itself as "expired". Verified against the Auth emulator.
    //
    // An empty result is ambiguous rather than conclusive: with email enumeration
    // protection turned on, this returns [] for addresses that do exist. So a
    // collision is still handled below, just with honest copy instead of a lie
    // about the link being expired.
    let existingMethods: string[] = [];
    try {
      existingMethods = await fetchSignInMethodsForEmail(auth, email);
    } catch {
      // Treat an unknown answer as "probably new" and let the link attempt decide.
    }

    if (existingMethods.length === 0) {
      const credential = EmailAuthProvider.credentialWithLink(
        email,
        window.location.href
      );
      try {
        const result = await linkWithCredential(current, credential);
        finish();
        return { user: result.user, previousUid: null, linked: true };
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (
          code === 'auth/credential-already-in-use' ||
          code === 'auth/email-already-in-use'
        ) {
          // Enumeration protection hid the account from the check above and the
          // code is now spent. Say exactly that rather than blaming the link.
          clearLinkFromUrl();
          throw new EmailLinkError({ reason: 'email-taken', code });
        }
        clearLinkFromUrl();
        throw new EmailLinkError(classifyLinkError(err));
      }
    }

    // The email already has an account. Firebase cannot merge two accounts, so
    // signing into the existing one is the only option and the anonymous identity
    // is left behind. previousUid drives the migration attempt and the
    // stranded-recipe notice.
    try {
      const previousUid = current.uid;
      const result = await signInWithEmailLink(auth, email, window.location.href);
      finish();
      return { user: result.user, previousUid, linked: false };
    } catch (err) {
      clearLinkFromUrl();
      throw new EmailLinkError(classifyLinkError(err));
    }
  }

  // Plain sign-in: no anonymous session to upgrade.
  try {
    const previousUid = current?.isAnonymous ? current.uid : null;
    const result = await signInWithEmailLink(auth, email, window.location.href);
    finish();
    return { user: result.user, previousUid, linked: false };
  } catch (err) {
    clearLinkFromUrl();
    throw new EmailLinkError(classifyLinkError(err));
  }
}

export async function setDisplayName(name: string) {
  if (!auth?.currentUser) return;
  await updateProfile(auth.currentUser, { displayName: name });
}

export async function signOut() {
  if (!auth) return;
  return fbSignOut(auth);
}
