import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeNotificationPrefs, setNotificationPrefs } from '../services/firestore';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../lib/notifications';

type Key = keyof NotificationPrefs;

/**
 * The owner's "Notify me when" choices. Subscribes only for a verified user; all on until a
 * document exists. `loaded` is true after the first snapshot or a failed read (and at once
 * when there is nothing to read). Writes wait for `loaded`, never follow a failed read
 * (`readFailed`), and are serialised: one at a time.
 */
export function useNotificationPrefs() {
  const { user, isConfigured } = useAuth();
  const uid = isConfigured && user?.emailVerified ? user.uid : undefined;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loadedUid, setLoadedUid] = useState<string | undefined>();
  const [failedReadUid, setFailedReadUid] = useState<string | undefined>();
  const [pending, setPending] = useState<Key[]>([]);
  const [failedKey, setFailedKey] = useState<Key | null>(null);
  const latest = useRef(prefs);
  const uidRef = useRef(uid);

  const apply = useCallback((next: NotificationPrefs) => {
    latest.current = next;
    setPrefs(next);
  }, []);

  useEffect(() => {
    uidRef.current = uid;
    apply(DEFAULT_NOTIFICATION_PREFS);
    setPending([]);
    setFailedKey(null);
    if (!uid) return;
    const done = () => setLoadedUid(uid);
    const failed = () => {
      setFailedReadUid(uid);
      done();
    };
    return subscribeNotificationPrefs(
      uid,
      (p) => {
        apply(p ?? DEFAULT_NOTIFICATION_PREFS);
        done();
      },
      failed
    );
  }, [uid, apply]);

  const loaded = !uid || loadedUid === uid;
  // A failed read leaves defaults on screen; writing them would overwrite the stored choices.
  const readFailed = !!uid && failedReadUid === uid;

  const setPref = useCallback(
    async (key: Key, value: boolean) => {
      if (!uid || !loaded || readFailed || pending.length) return;
      setFailedKey(null);
      setPending((p) => [...p, key]);
      apply({ ...latest.current, [key]: value });
      try {
        await setNotificationPrefs(uid, latest.current);
      } catch {
        // A late failure from a previous account must not touch the new one.
        if (uidRef.current !== uid) return;
        apply({ ...latest.current, [key]: !value });
        setFailedKey(key);
      } finally {
        if (uidRef.current === uid) setPending((p) => p.filter((k) => k !== key));
      }
    },
    [uid, loaded, readFailed, pending, apply]
  );

  return { enabled: !!uid, loaded, readFailed, prefs, pending, setPref, failedKey };
}
