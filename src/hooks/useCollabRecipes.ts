import { useCallback, useEffect, useState } from 'react';
import { getCollabRecipes } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { withTimeout } from '../lib/utils';
import type { SharedRecipe } from '../lib/share';

const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMED_OUT = Symbol('timed out');
type CollabRecipe = SharedRecipe & { id: string; createdAt: number };
type Read = { recipes: CollabRecipe[]; truncated: boolean };
const NONE: CollabRecipe[] = [];

// Successes only, per uid, so returning to a profile within 5 minutes does not read again.
const cache = new Map<string, { at: number; read: Read }>();
const fresh = (uid: string) => {
  const hit = cache.get(uid);
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.read : null;
};
/** Test use only: the cache is module state. */
export function clearCollabCache() {
  cache.clear();
}

/**
 * The recipes of other cooks that credit `uid` (RL-173), bounded at 6 s. Loading, ready and
 * error are distinct so a failed or slow read never shows as "No collabs yet". It reads only
 * while `enabled` (the Collabs tab has been opened, and not in local-only mode).
 */
export function useCollabRecipes(uid: string | undefined, enabled = true) {
  // Stamped with the uid so profile A's late answer never renders under profile B.
  const [state, setState] = useState<{ uid: string; read: Read | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uid || !enabled || fresh(uid)) return;
    let cancelled = false;
    withTimeout<Read | typeof TIMED_OUT | null>(
      getCollabRecipes(uid).catch((err) => {
        reportError(err, 'collab-recipes');
        return null;
      }),
      TIMEOUT_MS,
      TIMED_OUT
    ).then((out) => {
      if (out === TIMED_OUT) reportError(new Error('collab-recipes timeout'), 'collab-recipes');
      const read = out && out !== TIMED_OUT && Array.isArray(out.recipes) ? out : null;
      if (read) cache.set(uid, { at: Date.now(), read });
      if (!cancelled) setState({ uid, read });
    });
    return () => {
      cancelled = true;
    };
  }, [uid, enabled, attempt]);

  const retry = useCallback(() => {
    if (uid) cache.delete(uid);
    setState(null);
    setAttempt((n) => n + 1);
  }, [uid]);
  const mine = uid && enabled ? (state?.uid === uid ? state : fresh(uid) ? { uid, read: fresh(uid) } : null) : null;
  const status: 'loading' | 'ready' | 'error' = !mine ? 'loading' : mine.read ? 'ready' : 'error';
  return { status, recipes: mine?.read?.recipes ?? NONE, truncated: !!mine?.read?.truncated, retry };
}
