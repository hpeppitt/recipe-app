import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged as fbOnAuthStateChanged,
  signInAnonymously as fbSignInAnonymously,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updateProfile,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

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
  auth = getAuth(app);
  firestore = getFirestore(app);
  if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    getAnalytics(app);
  }
}

export { auth, firestore, type User };

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

export async function completeEmailSignIn(): Promise<User | null> {
  if (!auth) return null;
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  const email = localStorage.getItem('emailForSignIn');
  if (!email) return null;
  const result = await signInWithEmailLink(auth, email, window.location.href);
  localStorage.removeItem('emailForSignIn');
  window.history.replaceState({}, '', window.location.pathname);
  return result.user;
}

export async function setDisplayName(name: string) {
  if (!auth?.currentUser) return;
  await updateProfile(auth.currentUser, { displayName: name });
}

export async function signOut() {
  if (!auth) return;
  return fbSignOut(auth);
}
