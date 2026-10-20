import { useContext, useEffect, useRef } from 'react';
import { useAuth, TermsContext } from '../contexts/AuthContext';
import { getPendingAction, clearPendingAction } from '../services/storage';
import type { PendingAction } from '../lib/pendingAction';

/**
 * Runs the save, follow, suggest or branch a signed-out visitor asked a sign-in link for
 * (RL-135), once, on the page it belongs to (RL-136). Waits for a verified user, settled
 * auth and no Terms prompt; only the uid this device's link signed in may run it. The
 * stored action is cleared before `run`, so a failure is never retried. `match` also says
 * whether the page is ready (its recipe or lookup loaded); until it says yes, the action
 * stays stored for this or another page.
 */
export function usePendingAction(
  match: (a: PendingAction) => boolean,
  run: (a: PendingAction) => void
): void {
  const { user, isLoading } = useAuth();
  const termsPending = useContext(TermsContext)?.pending ?? false;
  // StrictMode replays effects on the same instance, so the ref holds across the replay.
  const ranRef = useRef(false);

  // No deps on purpose: `match` reads page state that changes render to render, and the
  // read is one localStorage get.
  useEffect(() => {
    if (ranRef.current || isLoading || !user?.emailVerified || termsPending) return;
    const action = getPendingAction();
    if (!action || action.by !== user.uid || !match(action)) return;
    ranRef.current = true;
    clearPendingAction();
    run(action);
  });
}
