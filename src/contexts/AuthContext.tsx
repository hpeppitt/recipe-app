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
  pushLocalFavoritesToCloud,
  getAcceptedTermsVersion,
  recordTermsAcceptance,
} from '../services/firestore';
import { migrateRecipesUid, clearOwnRecipes } from '../db/recipes';
import { migrateFavoritesUid } from '../db/favorites';
import {
  getAnonymousUid,
  setAnonymousUid,
  clearAnonymousUid,
  addPreviousUid,
  getDeviceId,
  getTermsAcceptance,
  clearTermsAcceptance,
  normaliseEmail,
  clearPendingAction,
  claimPendingAction,
} from '../services/storage';
import { TERMS_VERSION } from '../lib/legal';
import { onConsentChange, trackSignIn, trackSignOut, setAnalyticsUserId } from '../services/analytics';
import { reportError } from '../services/telemetry';

/** Rechecks after a failed Terms read, per session; each needs an online or tab-visible event. */
const TERMS_CHECK_RETRIES = 3;

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

export interface AuthContextType {
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

/**
 * The Terms prompt (RL-047), apart from AuthContextType so the many fake auth contexts
 * in tests stay valid. AuthProvider sits outside the router, so it only holds the state;
 * TermsGate, inside the router, decides where the dialog may show.
 */
export interface TermsContextType {
  /** A verified account owes a current Terms acceptance. */
  pending: boolean;
  /** Records the acceptance; rejects so the dialog can offer Retry. */
  accept: () => Promise<void>;
  /** Declining signs out; rejects if sign-out fails. */
  decline: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components -- exported so tests can inject a fake value; only affects HMR for this file
export const AuthContext = createContext<AuthContextType | null>(null);
// eslint-disable-next-line react-refresh/only-export-components -- same reason as AuthContext
export const TermsContext = createContext<TermsContextType | null>(null);

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

/**
 * Make sure a verified account has its `profiles/{uid}` document.
 *
 * Anonymous and unverified accounts get none: the rules deny the write
 * (decision 1a) and their generated name lives on the Firebase Auth user. Follows
 * and publishing update this document, so a verified account without one would
 * fail those writes.
 */
function ensureProfile(user: User): void {
  if (!user.emailVerified) return;
  createOrUpdateProfile(user.uid, { displayName: user.displayName }).catch(() => {});
}

async function runMigration(
  oldUid: string,
  newUid: string,
  displayName: string | null
): Promise<void> {
  if (oldUid === newUid) return;
  // Local carry-over only: an anonymous account owns no cloud data (RL-040).
  await Promise.all([
    migrateRecipesUid(oldUid, newUid, displayName),
    migrateFavoritesUid(oldUid, newUid),
  ]);
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
  const favoritesPushedRef = useRef<string | null>(null);
  // The uid owing a Terms acceptance; TermsGate shows the dialog while it matches the user.
  const [termsPromptUid, setTermsPromptUid] = useState<string | null>(null);
  const termsCheckRef = useRef<{ uid: string; done: Promise<void> } | null>(null);
  // Set after a failed read, so coming back online or to the tab can try again, a few times.
  const termsRetryRef = useRef<{ user: User; left: number } | null>(null);
  const termsReportedRef = useRef(false);
  // The signed-in uid right now, so a check that resolves after sign-out or a switch writes nothing.
  const currentUidRef = useRef<string | null>(null);

  /**
   * Make sure a verified account has accepted the current Terms (RL-047). Never throws.
   * Resolves true when the answer is known, false when the read failed.
   *
   * A failed read is UNKNOWN, not "not accepted": if the client ships before the
   * rules, every read is denied, and a blocking dialog whose Accept is also denied
   * would trap the user. So a read error lets them continue and arms a bounded retry;
   * only a successful read of a missing or older version leads to a write or the dialog.
   */
  const checkTerms = async (u: User): Promise<boolean> => {
    let version: string | null;
    try {
      version = await getAcceptedTermsVersion(u.uid);
    } catch (err) {
      if (currentUidRef.current !== u.uid) return true;
      // Once per session: retries and later sign-ins would otherwise repeat it.
      if (!termsReportedRef.current) {
        termsReportedRef.current = true;
        reportError(err, 'terms-check');
      }
      if (termsRetryRef.current?.user.uid !== u.uid) {
        termsRetryRef.current = { user: u, left: TERMS_CHECK_RETRIES };
      }
      return false;
    }
    if (currentUidRef.current !== u.uid) return true;
    termsRetryRef.current = null;
    if (version === TERMS_VERSION) return true;
    // Only an entry ticked for this very address counts; anyone else's is ignored.
    const stored = getTermsAcceptance();
    if (stored?.version === TERMS_VERSION && !!u.email && normaliseEmail(stored.email) === normaliseEmail(u.email)) {
      try {
        await recordTermsAcceptance(u.uid, stored.acceptedAt);
        clearTermsAcceptance();
        return true;
      } catch (err) {
        // Fall through to the dialog, which can retry.
        reportError(err, 'terms-record');
      }
    }
    if (currentUidRef.current !== u.uid) return true;
    setTermsPromptUid(u.uid);
    return true;
  };

  /**
   * One check per uid per session: the existing-account upgrade reaches it from both
   * onAuthStateChanged and the link completion, and both must wait for the same write.
   * Runs before ensureProfile and the favourites push on every path. A failed read is
   * not cached, so a later trigger checks again.
   */
  const checkTermsOnce = (u: User): Promise<void> => {
    if (!u.emailVerified) return Promise.resolve();
    if (termsCheckRef.current?.uid !== u.uid) {
      const done = checkTerms(u).then((known) => {
        if (!known && termsCheckRef.current?.uid === u.uid) termsCheckRef.current = null;
      });
      termsCheckRef.current = { uid: u.uid, done };
    }
    return termsCheckRef.current.done;
  };

  // Fired by `online` and by the tab becoming visible again; a no-op unless a read failed.
  const retryTermsCheck = () => {
    const retry = termsRetryRef.current;
    if (!retry || retry.left <= 0 || termsCheckRef.current) return;
    retry.left -= 1;
    void checkTermsOnce(retry.user);
  };

  /**
   * Carry local bookmarks into cloud favourites once per upgraded uid (RL-034).
   * Never awaited by the caller and never throws: the upgrade is already done.
   */
  const pushFavoritesOnce = async (upgraded: User, linked: boolean) => {
    if (favoritesPushedRef.current === upgraded.uid) return;
    if (!upgraded.emailVerified) {
      console.error('[auth] upgraded user is not email-verified; local favourites not pushed');
      return;
    }
    favoritesPushedRef.current = upgraded.uid;
    try {
      const { attempted, skipped } = await pushLocalFavoritesToCloud(upgraded.uid);
      if (skipped > 0) {
        const err = new Error(`${skipped} of ${attempted} local favourites were not pushed to the cloud`);
        // Only a linked upgrade has all-new rows. An existing account may already hold
        // some in the cloud, which the rules deny as updates, so a skip there is not
        // a fault: log it instead of reporting it.
        if (linked) reportError(err, 'favorites-upgrade');
        else console.error('[auth] favourites carry-over', err.message);
      }
    } catch (err) {
      reportError(err, 'favorites-upgrade');
    }
  };

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
      // Before the listener may have fired for a new uid; this user is signed in now.
      currentUidRef.current = result.user.uid;
      if (result.linked) {
        // Linking keeps the uid, so onAuthStateChanged does not fire again and
        // would leave this session holding the anonymous user and no profile.
        setUser(toAppUser(result.user));
        await checkTermsOnce(result.user);
        ensureProfile(result.user);
        void pushFavoritesOnce(result.user, true);
      }
      if (result.previousUid) {
        await checkTermsOnce(result.user);
        // The email already had an account, so the anonymous identity was left
        // behind. Carry the local recipes and bookmarks over to the account.
        await runMigration(result.previousUid, result.user.uid, result.user.displayName);
        clearAnonymousUid();
        addPreviousUid(result.user.uid);
        // After runMigration, so the Dexie rows are already under the new uid.
        void pushFavoritesOnce(result.user, false);
      }
      // The intent (RL-135) runs only for the account this device's own link signed in (RL-136).
      // A typed address means the link was sent from elsewhere, so a stored intent is not its.
      if (emailOverride) {
        clearPendingAction();
      } else {
        // Cached per uid; awaited so the Terms prompt is known before the intent can run.
        await checkTermsOnce(result.user);
        claimPendingAction(result.user.uid);
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
          // The link is spent, so the intent it carried (RL-135) must not ride on a later sign-in.
          clearPendingAction();
          reportError(err, `email-link-${err.failure.reason}`);
        }
        return;
      }
      console.error('[auth] email link completion failed', err);
      reportError(err, 'email-link-unknown');
      clearPendingAction();
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

    const onVisible = () => {
      if (document.visibilityState === 'visible') retryTermsCheck();
    };
    window.addEventListener('online', retryTermsCheck);
    document.addEventListener('visibilitychange', onVisible);

    // A user may authenticate before choosing analytics consent. Identify them
    // once consent opens the capture gate, using the same stable Firebase UID.
    const unsubscribeConsent = onConsentChange((granted) => {
      if (granted && currentUidRef.current) {
        setAnalyticsUserId(currentUidRef.current);
      }
    });

    const unsubscribe = onAuthStateChanged((fbUser) => {
      const hadUser = currentUidRef.current !== null;
      currentUidRef.current = fbUser?.uid ?? null;
      if (fbUser) {
        const appUser = toAppUser(fbUser);
        setUser(appUser);

        // Analytics User-ID (no-op until RL-054)
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

        // Acceptance first, so a new account's first contributing write already passes.
        void checkTermsOnce(fbUser).then(() => ensureProfile(fbUser));
      } else {
        // Signed out elsewhere (another tab, a revoked session): drop the unrun intent too.
        // Not on a load that starts signed out, which is how a link's own tab begins.
        if (hadUser) clearPendingAction();
        setUser(null);
        termsCheckRef.current = null;
        termsRetryRef.current = null;
        setTermsPromptUid(null);
        setAnalyticsUserId(null);
      }
      setIsLoading(false);
    });
    return () => {
      unsubscribe();
      unsubscribeConsent();
      window.removeEventListener('online', retryTermsCheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleSignInAnonymously = async () => {
    const result = await signInAnonymously();
    // Auto-assign a fun display name for anonymous users
    if (result.user && !result.user.displayName) {
      const name = generateDisplayName(result.user.uid);
      await setDisplayName(name);
      // The name stays on the Firebase Auth user only. No profile document until
      // the account is upgraded to a verified email (ensureProfile).
      setUser(toAppUser({ ...result.user, displayName: name } as User));
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
    // A ticked box belongs to whoever ticked it; the next person on this device ticks their own.
    clearTermsAcceptance();
    // Same for an unrun sign-in intent (RL-136): it must not run for the next person.
    clearPendingAction();
    const current = auth?.currentUser;
    const verifiedUid = current && !current.isAnonymous && current.emailVerified ? current.uid : null;
    await signOut();
    // A verified user's recipes are a cache of Firestore (decision 1b); the next sign-in refills them.
    if (verifiedUid) {
      try {
        await clearOwnRecipes(verifiedUid);
      } catch (err) {
        console.error('Clearing own recipes on sign-out failed', err);
        reportError(err, 'sign-out-clear');
      }
    }
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

  // Rejections reach the dialog, which shows the inline error and Retry.
  const handleAcceptTerms = async () => {
    if (!termsPromptUid) return;
    try {
      await recordTermsAcceptance(termsPromptUid, Date.now());
    } catch (err) {
      reportError(err, 'terms-accept');
      throw err;
    }
    clearTermsAcceptance();
    setTermsPromptUid(null);
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
        linkState,
        submitLinkEmail: handleSubmitLinkEmail,
        dismissLinkState: handleDismissLinkState,
      }}
    >
      <TermsContext.Provider
        value={{
          pending: !!termsPromptUid && user?.uid === termsPromptUid,
          accept: handleAcceptTerms,
          decline: handleSignOut,
        }}
      >
        {children}
      </TermsContext.Provider>
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is intentionally co-located with AuthProvider; only affects HMR fast refresh for this file
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
