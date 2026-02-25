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

/** Subscribe to the current user's own profile */
export function useOwnProfile() {
  const { user, isConfigured } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!isConfigured || !user) {
      setProfile(null);
      return;
    }
    return subscribeProfile(user.uid, setProfile);
  }, [isConfigured, user?.uid]);

  const updateAvatar = useCallback(
    async (data: {
      photoType: 'generated' | 'emoji' | 'uploaded';
      photoEmoji?: string | null;
      photoBgColor?: string | null;
      photoURL?: string | null;
    }) => {
      if (!user) return;
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
      if (!user) return;
      await setDisplayName(name);
      await createOrUpdateProfile(user.uid, { displayName: name });
      trackProfileUpdated('display_name');
    },
    [user]
  );

  return { profile, updateAvatar, updateName };
}

/** Fetch another user's profile (one-time, not real-time) */
export function usePublicProfile(uid: string | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    getProfile(uid).then((p) => {
      setProfile(p);
      setIsLoading(false);
    });
  }, [uid]);

  return { profile, isLoading };
}
