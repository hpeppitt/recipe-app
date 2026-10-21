import { useEffect, useState } from 'react';

/**
 * Keeps the screen on while `active` (RL-203). The browser drops the lock whenever the tab
 * is hidden, so it is asked for again each time the page becomes visible. Returns false when
 * the Screen Wake Lock API is missing or the request was refused, so the caller can say so.
 */
export function useWakeLock(active: boolean): boolean {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    if (!active || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (cancelled) void l.release().catch(() => {});
          else {
            lock = l;
            setRefused(false);
          }
        },
        () => !cancelled && setRefused(true)
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, [active, supported]);

  return supported && !refused;
}
