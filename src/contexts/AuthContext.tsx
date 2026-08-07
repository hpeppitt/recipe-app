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
import {
  createOrUpdateProfile,
  migrateFirestoreUid,
  type UidMigrationOutcome,
} from '../services/firestore';
import { shouldNotify } from '../lib/migration';
import { migrateRecipesUid } from '../db/recipes';
import { migrateFavoritesUid } from '../db/favorites';
import {
  getAnonymousUid,
  setAnonymousUid,
  clearAnonymousUid,
  addPreviousUid,
  getDeviceId,
  setStrandedIdentity,
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
  displayName: string | null,
  /** The name the stranded recipes were published under, for the notice copy. */
  oldDisplayName: string | null
): Promise<void> {
  if (oldUid === newUid) return;
  const [, , cloud] = await Promise.all([
    migrateRecipesUid(oldUid, newUid, displayName),
    migrateFavoritesUid(oldUid, newUid),
    // A throw here means a step after recipes failed, which strands no recipes.
    migrateFirestoreUid(oldUid, newUid, displayName).catch(
      (): UidMigrationOutcome => ({ ok: false, strandedRecipes: 0 })
    ),
  ]);

  // The cloud half of this is expected to fail: rules forbid reassigning
  // `createdBy.uid`, deliberately. It used to fail behind `.catch(() => {})`,
  // so a user could lose their whole published catalog and never be told.
  if (shouldNotify(cloud)) {
    setStrandedIdentity({
      oldUid,
      oldDisplayName,
      recipeCount: cloud.strandedRecipes,
      at: Date.now(),
    });
  }
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
            result.user.displayName,
            // The old account is always an anonymous one on every path into
            // runMigration, and anonymous display names are derived from the uid
            // (lib/identity.ts), so this reproduces exactly the name the stranded
            // recipes were published under without having kept the old user
            // object around.
            generateDisplayName(result.previousUid)
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
            runMigration(
              savedUid,
              fbUser.uid,
              fbUser.displayName,
              generateDisplayName(savedUid)
            ).then(() => {
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
            runMigration(
              savedAnonUid,
              fbUser.uid,
              fbUser.displayName,
              generateDisplayName(savedAnonUid)
            ).then(() => {
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

  // Anonymous sign-out used to throw. The intent was protective — an anonymous
  // account cannot be signed back into — but it left people genuinely stuck:
  // no way off a shared device, and no way to reach an existing email account,
  // since AuthModal auto-dismisses while any user exists. The consequences are
  // now spelled out in a confirmation instead of the exit being removed.
  const handleSignOut = async () => {
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

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is intentionally co-located with AuthProvider; only affects HMR fast refresh for this file
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
