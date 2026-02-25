import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  isFollowing as checkIsFollowing,
  followUser,
  unfollowUser,
  getFollowingIds,
  getFollowingProfiles,
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
