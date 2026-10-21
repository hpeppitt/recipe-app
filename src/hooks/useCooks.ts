import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../services/firebase';
import { getRecipeCookSummary, logCook, newCookId, subscribeOwnCooks, type RecipeCookSummary } from '../services/firestore';
import { reportError } from '../services/telemetry';
import type { Cook } from '../types/social';

const EMPTY: RecipeCookSummary = { total: 0, again: 0, recent: [] };
const NO_COOKS: Cook[] = [];

/**
 * One recipe's cook counts and newest 20 cooks (RL-196), read once per visit and
 * again after `log`. Loading, ready and error are distinct so a failed read never
 * shows as "nobody made this". Reads nothing without Firebase.
 */
export function useRecipeCooks(recipeId: string | undefined) {
  // Stamped with the recipe id so recipe A's late answer never renders under recipe B.
  const [state, setState] = useState<{ recipeId: string; summary: RecipeCookSummary | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!recipeId || !isFirebaseConfigured) return;
    let cancelled = false;
    getRecipeCookSummary(recipeId).then(
      (summary) => !cancelled && setState({ recipeId, summary }),
      (err) => {
        reportError(err, 'recipe-cooks');
        // A failed refresh keeps the summary already shown for this recipe.
        if (!cancelled) setState((prev) => (prev?.recipeId === recipeId && prev.summary ? prev : { recipeId, summary: null }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [recipeId, attempt]);

  // Keeps the shown summary while the re-read runs, so the row does not flicker.
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  // Kept across a timed-out attempt, so a retry reuses the id and cannot log the cook twice.
  const pendingId = useRef<string | null>(null);

  /** Log a cook, then re-read the summary. Throws what logCook throws. */
  const log = useCallback(
    async (params: Omit<Parameters<typeof logCook>[0], 'cookId'>) => {
      pendingId.current ??= newCookId();
      try {
        const id = await logCook({ ...params, cookId: pendingId.current });
        pendingId.current = null;
        refresh();
        return id;
      } catch (err) {
        // A timed-out transaction may still commit; any other failure did not write.
        if (!(err instanceof Error && err.message.endsWith('timed out'))) pendingId.current = null;
        throw err;
      }
    },
    [refresh]
  );

  if (!isFirebaseConfigured) return { status: 'ready' as const, summary: EMPTY, refresh, log };
  const mine = state && state.recipeId === recipeId ? state : null;
  const status: 'loading' | 'ready' | 'error' = !mine ? 'loading' : mine.summary ? 'ready' : 'error';
  return { status, summary: mine?.summary ?? EMPTY, refresh, log };
}

/**
 * The signed-in user's own newest 200 cooks, live, for the cook log and the
 * Cooked stat (RL-196). Verified users only: anyone else gets an empty list and
 * nothing is read.
 */
export function useOwnCooks() {
  const { user, isConfigured } = useAuth();
  const uid = isConfigured && user?.emailVerified ? user.uid : null;
  const [state, setState] = useState<{ uid: string; cooks: Cook[] | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeOwnCooks(
      uid,
      (cooks) => setState({ uid, cooks }),
      (err) => {
        reportError(err, 'own-cooks');
        setState({ uid, cooks: null });
      }
    );
  }, [uid]);

  if (!uid) return { status: 'ready' as const, cooks: NO_COOKS };
  const mine = state?.uid === uid ? state : null;
  const status: 'loading' | 'ready' | 'error' = !mine ? 'loading' : mine.cooks ? 'ready' : 'error';
  return { status, cooks: mine?.cooks ?? NO_COOKS };
}
