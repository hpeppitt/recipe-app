import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/firestore';
import type { AppNotification } from '../types/social';

export function useNotifications() {
  const { user, isConfigured } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // The panel had no way to tell "waiting for the first snapshot" from "there is
  // nothing here", so it showed the empty state during startup and after a
  // failure alike.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isConfigured || !user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      setError(false);
      return;
    }
    setIsLoading(true);
    setError(false);
    return subscribeNotifications(
      user.uid,
      (notifs) => {
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n) => !n.read).length);
        setIsLoading(false);
      },
      () => {
        setError(true);
        setIsLoading(false);
      }
    );
  }, [isConfigured, user?.uid]);

  const markRead = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
    },
    []
  );

  const uid = user?.uid;
  const markAllRead = useCallback(async () => {
    if (!uid) return;
    await markAllNotificationsRead(uid);
  }, [uid]);

  return { notifications, unreadCount, isLoading, error, markRead, markAllRead };
}
