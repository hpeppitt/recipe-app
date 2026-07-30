import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged as fbOnAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  linkWithCredential,
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
};

export async function completeEmailSignIn(): Promise<EmailLinkResult | null> {
  if (!auth) return null;
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;

  const linkingEmail = getEmailForLinking();
  const signInEmail = localStorage.getItem('emailForSignIn');

  // Try credential linking first (anonymous → email upgrade)
  if (linkingEmail && auth.currentUser && auth.currentUser.isAnonymous) {
    try {
      const credential = EmailAuthProvider.credentialWithLink(
        linkingEmail,
        window.location.href
      );
      const result = await linkWithCredential(auth.currentUser, credential);
      clearEmailForLinking();
      localStorage.removeItem('emailForSignIn');
      window.history.replaceState({}, '', window.location.pathname);
      return { user: result.user, previousUid: null }; // UID stays the same
    } catch (err: unknown) {
      // auth/credential-already-in-use: email already has an account
      // Fall through to regular sign-in + migration
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === 'auth/credential-already-in-use') {
        const previousUid = auth.currentUser.uid;
        const result = await signInWithEmailLink(
          auth,
          linkingEmail,
          window.location.href
        );
        clearEmailForLinking();
        localStorage.removeItem('emailForSignIn');
        window.history.replaceState({}, '', window.location.pathname);
        return { user: result.user, previousUid };
      }
      // Other errors: clear and fall through
      clearEmailForLinking();
    }
  }

  // Regular email sign-in
  const email = linkingEmail || signInEmail;
  if (!email) return null;

  const previousUid = auth.currentUser?.isAnonymous ? auth.currentUser.uid : null;
  const result = await signInWithEmailLink(auth, email, window.location.href);
  clearEmailForLinking();
  localStorage.removeItem('emailForSignIn');
  window.history.replaceState({}, '', window.location.pathname);
  return { user: result.user, previousUid };
}

export async function setDisplayName(name: string) {
  if (!auth?.currentUser) return;
  await updateProfile(auth.currentUser, { displayName: name });
}

export async function signOut() {
  if (!auth) return;
  return fbSignOut(auth);
}
