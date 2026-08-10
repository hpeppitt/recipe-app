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
  isEmailLinkLanding,
  EmailLinkError,
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
import { reportError } from '../services/telemetry';

/**
 * Progress and outcome of a magic-link landing.
 *
 * `idle` covers the normal page load with no link in the URL. The rest exist so
 * the UI can report what happened: previously every one of these was a silent
 * no-op and the user simply stayed signed out.
 */
export type EmailLinkState =
  | { status: 'idle' }
  | { status: 'completing' }
  | { status: 'needs-email' }
  | { status: 'error'; reason: 'expired' | 'email-taken' | 'failed' }
  | { status: 'done'; linked: boolean };

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  signInAnonymously: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  linkEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  /** Progress of a magic-link landing, for the banner in AppShell. */
  linkState: EmailLinkState;
  /** Retry completion with an address the user typed (cross-device case). */
  submitLinkEmail: (email: string) => Promise<void>;
  dismissLinkState: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    isAnonymous: user.isAnonymous,
    // Both routes to a verified email here (linkWithCredential on an anonymous
    // account, and signInWithEmailLink) mint a fresh ID token as part of the
    // call, so this is true the moment the rules would accept a write. No
    // getIdToken(true) is needed. That would change if a path ever verified an
    // address out of band, e.g. sendEmailVerification clicked through elsewhere.
    emailVerified: user.emailVerified,
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
  // Seeded from the URL rather than set in the effect, so the "signing you in"
  // state is correct on the very first render. Setting it inside the effect
  // instead would flash the signed-out UI over a sign-in that is in flight, and
  // trips the set-state-in-effect rule.
  const [linkState, setLinkState] = useState<EmailLinkState>(() =>
    isEmailLinkLanding() ? { status: 'completing' } : { status: 'idle' }
  );
  const migrationRunRef = useRef(false);

  /**
   * Run (or retry) the magic-link completion and record the outcome.
   *
   * Shared by the on-mount attempt and the cross-device retry, so both paths
   * report identically.
   */
  const runEmailLinkCompletion = async (emailOverride?: string) => {
    try {
      const result = await completeEmailSignIn(emailOverride);
      if (!result) {
        setLinkState({ status: 'idle' });
        return;
      }
      if (result.previousUid) {
        // The email already had an account, so the anonymous identity was left
        // behind. Migrate what can be migrated and let the notice report the rest.
        await runMigration(
          result.previousUid,
          result.user.uid,
          result.user.displayName,
          // Anonymous display names are a pure function of the uid
          // (lib/identity.ts), so this reproduces exactly the name the stranded
          // recipes were published under without having kept the old user object.
          generateDisplayName(result.previousUid)
        );
        clearAnonymousUid();
        addPreviousUid(result.user.uid);
      }
      setLinkState({ status: 'done', linked: result.linked });
    } catch (err) {
      if (err instanceof EmailLinkError) {
        setLinkState(
          err.failure.reason === 'needs-email'
            ? { status: 'needs-email' }
            : { status: 'error', reason: err.failure.reason }
        );
        console.error('[auth] email link completion failed ' + JSON.stringify(err.failure));
        // needs-email is a normal branch, not a fault: the user opened the link
        // somewhere else and we are about to ask them for the address. Reporting
        // it would bury the real failures under the commonest happy-ish path.
        if (err.failure.reason !== 'needs-email') {
          reportError(err, `email-link-${err.failure.reason}`);
        }
        return;
      }
      console.error('[auth] email link completion failed', err);
      reportError(err, 'email-link-unknown');
      setLinkState({ status: 'error', reason: 'failed' });
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Initialize device ID on first load
    getDeviceId();

    // Handle email link completion on page load.
    //
    // Failures used to go into `.catch(() => {})`, so a user who clicked their
    // magic link and hit any problem landed on a signed-out app with no
    // explanation whatsoever. They are now surfaced as `linkState`.
    runEmailLinkCompletion();

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

  // Retry after the cross-device prompt. Keeps `completing` on screen while it
  // runs so the button cannot be double-submitted into two sign-in attempts.
  const handleSubmitLinkEmail = async (email: string) => {
    setLinkState({ status: 'completing' });
    await runEmailLinkCompletion(email);
  };

  const handleDismissLinkState = () => setLinkState({ status: 'idle' });

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
        linkState,
        submitLinkEmail: handleSubmitLinkEmail,
        dismissLinkState: handleDismissLinkState,
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
