import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/firestore';
import { useNotificationPrefs } from './useNotificationPrefs';
import { visibleFor } from '../lib/notifications';
import type { AppNotification } from '../types/social';

export function useNotifications() {
  const { user, isConfigured } = useAuth();
  const { prefs, loaded } = useNotificationPrefs();
  const [all, setAll] = useState<AppNotification[]>([]);
  // One filtered list feeds Activity, Mark all read and the badge, so they agree.
  const notifications = useMemo(() => (loaded ? visibleFor(all, prefs) : []), [all, prefs, loaded]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  // The panel had no way to tell "waiting for the first snapshot" from "there is
  // nothing here", so it showed the empty state during startup and after a
  // failure alike.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isConfigured || !user) {
      setAll([]);
      setIsLoading(false);
      setError(false);
      return;
    }
    setIsLoading(true);
    setError(false);
    return subscribeNotifications(
      user.uid,
      (notifs) => {
        setAll(notifs);
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

  // Until the preferences arrive, hidden types would flash: stay loading, badge 0.
  return { notifications, unreadCount, isLoading: isLoading || !loaded, prefs, error, markRead, markAllRead };
}
