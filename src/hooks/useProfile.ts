import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getProfile,
  createOrUpdateProfile,
  subscribeProfile,
} from '../services/firestore';
import { setDisplayName } from '../services/firebase';
import { trackProfileUpdated } from '../services/analytics';
import type { UserProfile } from '../types/profile';
import { withTimeout } from '../lib/utils';
import { cleanBio } from '../lib/bio';
import { isCountryCode } from '../lib/country';
import { reportError } from '../services/telemetry';

/** Subscribe to the current user's own profile */
export function useOwnProfile() {
  const { user, isConfigured } = useAuth();
  // Stamped with the uid it belongs to so `loaded` is false until the first snapshot for this user.
  const [state, setState] = useState<{ uid: string; profile: UserProfile | null } | null>(null);
  const uid = user?.uid;
  const live = isConfigured && !!uid && state?.uid === uid;
  const profile = live ? state.profile : null;
  const loaded = !isConfigured || !uid || live;

  useEffect(() => {
    if (!isConfigured || !uid) return;
    return subscribeProfile(uid, (p) => setState({ uid, profile: p }));
  }, [isConfigured, uid]);

  const updateAvatar = useCallback(
    async (data: {
      photoType: 'generated' | 'emoji' | 'uploaded';
      photoEmoji?: string | null;
      photoBgColor?: string | null;
      photoURL?: string | null;
    }) => {
      // Profiles are verified-only (decision 1a); the page routes others to sign-up.
      if (!user?.emailVerified) return;
      await createOrUpdateProfile(user.uid, {
        photoEmoji: data.photoEmoji ?? null,
        photoBgColor: data.photoBgColor ?? null,
        photoURL: data.photoURL ?? null,
        photoType: data.photoType,
      });
      trackProfileUpdated('avatar');
    },
    [user]
  );

  const updateName = useCallback(
    async (name: string) => {
      if (!user?.emailVerified) return;
      await setDisplayName(name);
      await createOrUpdateProfile(user.uid, { displayName: name });
      trackProfileUpdated('display_name');
    },
    [user]
  );

  const updateBio = useCallback(
    async (bio: string | null) => {
      if (!user?.emailVerified) return;
      await createOrUpdateProfile(user.uid, { bio: cleanBio(bio) });
      trackProfileUpdated('bio');
    },
    [user]
  );

  const updateCountry = useCallback(
    async (country: string | null) => {
      // Throws so the sheet shows its error instead of closing as if saved; the page gates guests first.
      if (!user?.emailVerified) throw new Error('profile writes need a verified email');
      // The RL-278 rules take a two-letter upper-case code or null; anything else is refused here.
      if (country !== null && !isCountryCode(country)) throw new Error('invalid country');
      await createOrUpdateProfile(user.uid, { country });
      trackProfileUpdated('country');
    },
    [user]
  );

  return { profile, loaded, updateAvatar, updateName, updateBio, updateCountry };
}

/** Fetch another user's profile (one-time, not real-time) */
/** How long a profile lookup waits before being treated as a failure. */
const PROFILE_TIMEOUT_MS = 6000;

export function usePublicProfile(uid: string | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // A failed lookup was indistinguishable from a deleted account: the `.then`
  // had no `.catch`, so a rejection left isLoading stuck true and raised an
  // unhandled rejection. Same class as UI-12 and UX-11.
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(false);

    // Bounded: against an unreachable backend Firestore retries rather than
    // rejecting, so a plain catch never fires and the page waits forever.
    withTimeout(
      getProfile(uid)
        .then((p) => ({ profile: p }))
        .catch((err) => {
          console.error('Loading the profile failed', err);
          reportError(err, 'load-profile');
          return null;
        }),
      PROFILE_TIMEOUT_MS,
      null
    ).then((result) => {
      if (cancelled) return;
      if (result === null) {
        setError(true);
        setProfile(null);
      } else {
        setProfile(result.profile);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [uid, reloadKey]);

  return { profile, isLoading, error, retry: () => setReloadKey((k) => k + 1) };
}
