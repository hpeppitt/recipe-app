import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import type { AppUser } from '../types/recipe';
import type { User } from '../services/firebase';
import {
  isFirebaseConfigured,
  auth,
  onAuthStateChanged,
  signInAnonymously,
  sendEmailSignInLink,
  sendEmailLinkForLinking,
  completeEmailSignIn,
  setDisplayName,
  signOut,
} from '../services/firebase';
import { generateDisplayName } from '../lib/identity';
import { createOrUpdateProfile, migrateFirestoreUid } from '../services/firestore';
import { migrateRecipesUid } from '../db/recipes';
import { migrateFavoritesUid } from '../db/favorites';
import {
  getAnonymousUid,
  setAnonymousUid,
  clearAnonymousUid,
  addPreviousUid,
  getDeviceId,
} from '../services/storage';
import { trackSignIn, trackSignOut, setAnalyticsUserId } from '../services/analytics';

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  signInAnonymously: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  linkEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    isAnonymous: user.isAnonymous,
  };
}

async function runMigration(
  oldUid: string,
  newUid: string,
  displayName: string | null
): Promise<void> {
  if (oldUid === newUid) return;
  await Promise.all([
    migrateRecipesUid(oldUid, newUid, displayName),
    migrateFavoritesUid(oldUid, newUid),
    migrateFirestoreUid(oldUid, newUid, displayName).catch(() => {}),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);
  const migrationRunRef = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Initialize device ID on first load
    getDeviceId();

    // Handle email link completion on page load
    completeEmailSignIn()
      .then((result) => {
        if (result?.previousUid) {
          // Migration needed: data from previousUid → result.user.uid
          runMigration(
            result.previousUid,
            result.user.uid,
            result.user.displayName
          );
          clearAnonymousUid();
          addPreviousUid(result.user.uid);
        }
      })
      .catch(() => {});

    return onAuthStateChanged((fbUser) => {
      if (fbUser) {
        const appUser = toAppUser(fbUser);
        setUser(appUser);

        // GA4 User-ID
        setAnalyticsUserId(fbUser.uid);

        if (fbUser.isAnonymous) {
          // Persist anonymous UID
          const savedUid = getAnonymousUid();
          if (savedUid && savedUid !== fbUser.uid && !migrationRunRef.current) {
            // UID drift detected — auto-migrate from saved UID
            migrationRunRef.current = true;
            runMigration(savedUid, fbUser.uid, fbUser.displayName).then(() => {
              setAnonymousUid(fbUser.uid);
            });
          } else {
            setAnonymousUid(fbUser.uid);
          }
        } else {
          // Email user: check if we need to migrate from a previous anonymous UID
          const savedAnonUid = getAnonymousUid();
          if (savedAnonUid && savedAnonUid !== fbUser.uid && !migrationRunRef.current) {
            migrationRunRef.current = true;
            runMigration(savedAnonUid, fbUser.uid, fbUser.displayName).then(() => {
              clearAnonymousUid();
              addPreviousUid(fbUser.uid);
            });
          } else {
            clearAnonymousUid();
          }
          addPreviousUid(fbUser.uid);
        }

        // Ensure profile exists in Firestore
        createOrUpdateProfile(fbUser.uid, {
          displayName: fbUser.displayName,
        }).catch(() => {});
      } else {
        setUser(null);
        setAnalyticsUserId(null);
      }
      setIsLoading(false);
    });
  }, []);

  const handleSignInAnonymously = async () => {
    const result = await signInAnonymously();
    // Auto-assign a fun display name for anonymous users
    if (result.user && !result.user.displayName) {
      const name = generateDisplayName(result.user.uid);
      await setDisplayName(name);
      setUser(toAppUser({ ...result.user, displayName: name } as User));
      await createOrUpdateProfile(result.user.uid, { displayName: name }).catch(() => {});
    }
    trackSignIn('anonymous');
  };

  const handleSendEmailLink = async (email: string) => {
    await sendEmailSignInLink(email);
    trackSignIn('email');
  };

  const handleLinkEmail = async (email: string) => {
    await sendEmailLinkForLinking(email);
  };

  const handleSignOut = async () => {
    if (user?.isAnonymous) {
      throw new Error('Anonymous users cannot sign out. Add an email to secure your account first.');
    }
    trackSignOut();
    clearAnonymousUid();
    await signOut();
  };

  const handleUpdateDisplayName = async (name: string) => {
    await setDisplayName(name);
    if (auth?.currentUser) {
      setUser(toAppUser(auth.currentUser));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isConfigured: isFirebaseConfigured,
        signInAnonymously: handleSignInAnonymously,
        sendEmailLink: handleSendEmailLink,
        linkEmail: handleLinkEmail,
        signOut: handleSignOut,
        updateDisplayName: handleUpdateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
