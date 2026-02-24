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

  useEffect(() => {
    if (!isConfigured || !user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    return subscribeNotifications(user.uid, (notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.read).length);
    });
  }, [isConfigured, user?.uid]);

  const markRead = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
    },
    []
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await markAllNotificationsRead(user.uid);
  }, [user?.uid]);

  return { notifications, unreadCount, markRead, markAllRead };
}
