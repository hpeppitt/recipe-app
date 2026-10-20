import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  isFollowing as checkIsFollowing,
  followUser,
  unfollowUser,
  getFollowingIds,
  getFollowingProfiles,
  getFollowers,
  type FollowerSummary,
} from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { trackFollowToggled } from '../services/analytics';
import type { UserProfile } from '../types/profile';
import { withTimeout } from '../lib/utils';
import { reportError } from '../services/telemetry';

const EMPTY_IDS: string[] = [];
const EMPTY_PROFILES: UserProfile[] = [];

/** Shown inline by the pages when a follow or favourite toggle fails. */
export const TOGGLE_ERROR = "Couldn't update that. Check your connection and try again.";

/** Upper bound on how long a toggle stays locked waiting on the cloud write. */
export const TOGGLE_TIMEOUT_MS = 5000;

/** Awaits a write for at most `ms`; a timeout rejects, and a real rejection keeps its error. */
export async function boundedWrite(write: Promise<unknown>, ms: number): Promise<void> {
  const outcome = await withTimeout(
    write.then(
      () => null,
      (error: unknown) => ({ error })
    ),
    ms,
    { error: new Error('Write timed out') }
  );
  if (outcome) throw outcome.error;
}

export function useFollow(targetUid: string | undefined) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const togglingRef = useRef(false);
  const keyRef = useRef<string | undefined>(undefined);

  // Unverified accounts cannot hold a follow (decision 1a), so skip the read.
  const verifiedUid = user?.emailVerified ? user.uid : undefined;
  const key = verifiedUid && targetUid ? `${verifiedUid}:${targetUid}` : undefined;
  // The lookup and the toggle error are stamped with the key they belong to, so a
  // late answer for profile A never shows under profile B and an error clears on
  // id change, without a setState in the effect body.
  // `failed` marks a lookup error, whose `following: false` is a guess, not an answer.
  const [lookup, setLookup] = useState<{ key: string; following: boolean; failed?: boolean } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (!key || !verifiedUid || !targetUid || verifiedUid === targetUid || !isFirebaseConfigured) return;
    let cancelled = false;
    checkIsFollowing(verifiedUid, targetUid)
      .then((following) => {
        if (!cancelled) setLookup({ key, following });
      })
      .catch((err) => {
        console.error('Follow lookup failed', err);
        reportError(err, 'follow-lookup');
        if (!cancelled) setLookup({ key, following: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [key, verifiedUid, targetUid]);

  const following = !!key && lookup?.key === key && lookup.following;

  const toggle = useCallback(async () => {
    // Verified only (decision 1a); the page shows the sign-up call to action instead.
    if (!user?.emailVerified || !targetUid || !key || togglingRef.current) return;
    togglingRef.current = true;
    setFailure(null);
    setLoading(true);
    try {
      // Bounded like the local favourite: offline, the SDK write promise stays
      // pending, which would lock the button and never show the error.
      // shortcut: a timed-out write may still commit when connectivity returns, so
      // the UI can then differ from the server until the next lookup.
      const write = following
        ? unfollowUser(user.uid, targetUid)
        : followUser(user.uid, targetUid, user.displayName);
      await boundedWrite(write, TOGGLE_TIMEOUT_MS);
      // Drop the result if the user has moved to another profile meanwhile.
      if (keyRef.current === key) setLookup({ key, following: !following });
      trackFollowToggled(targetUid, !following);
    } catch (err) {
      console.error('Toggling follow failed', err);
      reportError(err, 'follow-toggle');
      setFailure({ key, message: TOGGLE_ERROR });
    } finally {
      togglingRef.current = false;
      setLoading(false);
    }
  }, [user, targetUid, key, following]);

  return {
    isFollowing: following,
    toggleFollow: toggle,
    loading,
    error: !!key && failure?.key === key ? failure.message : null,
    /** The lookup for this pair has answered, so `isFollowing` is not a placeholder. */
    ready: !!key && lookup?.key === key && !lookup.failed,
  };
}

/**
 * Followers of the signed-in user.
 *
 * Own-profile only, matching the rules: another user's follow graph is not
 * readable, so there is no `uid` parameter to misuse.
 */
export function useFollowers() {
  const { user } = useAuth();
  const uid = user?.uid;
  // One state object stamped with the uid it belongs to. Loading is then derived
  // rather than set, which keeps every setState inside the async callback instead
  // of running synchronously in the effect body.
  const [state, setState] = useState<{
    uid: string | undefined;
    followers: FollowerSummary[];
    error: boolean;
  }>({ uid: undefined, followers: [], error: false });

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return;
    let cancelled = false;
    getFollowers(uid)
      .then((followers) => {
        if (!cancelled) setState({ uid, followers, error: false });
      })
      .catch((err) => {
        console.error('Loading followers failed', err);
        reportError(err, 'load-followers');
        if (!cancelled) setState({ uid, followers: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const settled = state.uid === uid;
  return {
    followers: settled ? state.followers : [],
    isLoading: !!uid && isFirebaseConfigured && !settled,
    error: settled && state.error,
  };
}

export function useFollowingList() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<{
    uid: string;
    ids: string[];
    profiles: UserProfile[];
  } | null>(null);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return;
    let cancelled = false;
    getFollowingIds(uid)
      .then(async (ids) => ({ ids, profiles: await getFollowingProfiles(ids) }))
      .then(({ ids, profiles }) => {
        if (!cancelled) setState({ uid, ids, profiles });
      })
      .catch((err) => {
        console.error('Loading following list failed', err);
        reportError(err, 'load-following');
        if (!cancelled) setState({ uid, ids: [], profiles: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const settled = !!uid && state?.uid === uid;
  return {
    followingIds: settled ? state.ids : EMPTY_IDS,
    followingProfiles: settled ? state.profiles : EMPTY_PROFILES,
    isLoading: !!uid && isFirebaseConfigured && !settled,
  };
}
