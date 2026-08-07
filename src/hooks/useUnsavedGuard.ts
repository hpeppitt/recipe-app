import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Stops browser Back, the iOS swipe-back gesture, reload and tab close from
 * silently discarding unsaved work.
 *
 * Extracted from `RecipeChatPage` when manual editing needed the same guard.
 * Duplicating it was the wrong option: the mechanism is subtle, the reasoning
 * behind it is expensive (see below), and two copies would drift.
 *
 * `useBlocker` is unavailable under `BrowserRouter`, and migrating to
 * `createBrowserRouter` did not help: with react-router 7.13.0 the blocker
 * callback was never invoked for POP at all. That attempt is recorded under UI-15
 * in AUDIT.md, including that StrictMode was ruled out as the cause. So this
 * intercepts POP directly.
 *
 * A sentinel history entry is parked on top of the page while `active`. The first
 * Back pops the sentinel rather than leaving; the handler immediately re-pushes it
 * — so the user stays put — and calls `onBlocked`, which is where the host opens
 * its discard dialog.
 *
 * @param active Whether there is unsaved work to protect.
 * @param onBlocked Called when a navigation attempt was intercepted.
 * @returns `leave`, which navigates away for real, unwinding the sentinel.
 */
export function useUnsavedGuard(active: boolean, onBlocked: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const guardArmedRef = useRef(false);

  // Held in a ref so the effect's deps stay `[active]`. A callback identity that
  // changes each render would re-run the effect and push a fresh sentinel every
  // time, stacking entries the user would have to Back through one by one.
  // Written in its own effect rather than during render: a ref assignment in the
  // render body is a lint error and, more to the point, is not safe under
  // concurrent rendering.
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    onBlockedRef.current = onBlocked;
  }, [onBlocked]);

  useEffect(() => {
    if (!active) return;

    window.history.pushState({ recipeGuard: true }, '');
    guardArmedRef.current = true;

    const onPop = () => {
      // Re-arm first, so a second Back is still caught if the dialog is dismissed
      // by any means other than its buttons.
      window.history.pushState({ recipeGuard: true }, '');
      onBlockedRef.current();
    };

    // Covers reload and tab close, which no in-app guard can observe. Browsers
    // show their own generic wording; preventDefault is all that is required.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onBeforeUnload);
      guardArmedRef.current = false;
    };
  }, [active]);

  /**
   * Leave for real, after the user has confirmed.
   *
   * Consumes the sentinel as well as the page's own entry when one is parked.
   * React Router labels the first entry of a session 'default', so that key means
   * there is nothing behind us and home is the only sensible destination.
   */
  const leave = (fallback = '/') => {
    if (location.key === 'default') {
      navigate(fallback, { replace: true });
      return;
    }
    navigate(guardArmedRef.current ? -2 : -1);
  };

  return { leave };
}
