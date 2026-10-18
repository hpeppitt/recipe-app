import { useEffect, useState } from 'react';
import { useOwnRecipesSyncStatus } from './useOwnRecipesSync';

export const WAITING_CAP_MS = 6000;

/**
 * True while the first own-recipes sync is pending, the device is online, and
 * the page has been mounted under 6 seconds (RL-079). The status can stick at
 * `waiting` if the first Dexie apply fails, so the timer forces a re-render
 * and the page falls back to what it shows today.
 */
export function useOwnRecipesWaiting(): boolean {
  const status = useOwnRecipesSyncStatus();
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setExpired(true), WAITING_CAP_MS);
    return () => clearTimeout(t);
  }, []);
  return status === 'waiting' && !expired && navigator.onLine !== false;
}
