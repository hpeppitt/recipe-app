import { useState, useEffect, useCallback } from 'react';
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

export function useFollow(targetUid: string | undefined) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !targetUid || user.uid === targetUid || !isFirebaseConfigured) return;
    checkIsFollowing(user.uid, targetUid).then(setFollowing);
  }, [user?.uid, targetUid]);

  const toggle = useCallback(async () => {
    if (!user || !targetUid || loading) return;
    setLoading(true);
    try {
      if (following) {
        await unfollowUser(user.uid, targetUid);
        setFollowing(false);
      } else {
        await followUser(user.uid, targetUid, user.displayName);
        setFollowing(true);
      }
      trackFollowToggled(targetUid, !following);
    } finally {
      setLoading(false);
    }
  }, [user, targetUid, following, loading]);

  return { isFollowing: following, toggleFollow: toggle, loading };
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
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followingProfiles, setFollowingProfiles] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user || !isFirebaseConfigured) {
      setFollowingIds([]);
      setFollowingProfiles([]);
      return;
    }
    setIsLoading(true);
    Promise.all([
      getFollowingIds(user.uid),
      getFollowingProfiles(user.uid),
    ]).then(([ids, profiles]) => {
      setFollowingIds(ids);
      setFollowingProfiles(profiles);
      setIsLoading(false);
    });
  }, [user?.uid]);

  return { followingIds, followingProfiles, isLoading };
}
