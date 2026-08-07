import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { firestore, auth } from './firebase';
import {
  buildReport,
  shouldSend,
  recordSent,
  recordFailure,
  EMPTY_BUDGET,
  type BeaconBudget,
  type ErrorSource,
} from '../lib/telemetry';

/**
 * First-party client error beacon.
 *
 * Uses Firestore as the sink rather than adding Sentry: this is a deliberately
 * dependency-light app that already owns a database, and an error reporter that
 * costs money at exactly the moment things go wrong is the wrong trade at this
 * size. The call sites here are the migration seam if volume ever justifies a
 * real provider.
 *
 * Everything is best-effort and silent to the user. A diagnostics tool that
 * surfaces its own failures, or that can throw, is worse than no diagnostics.
 */

const COLLECTION = 'clientErrors';

// Session-scoped, in memory on purpose. Persisting it would carry a tripped
// circuit breaker across reloads, and a reload is exactly when you want another
// look at a failing app.
let budget: BeaconBudget = EMPTY_BUDGET;
let installed = false;

/**
 * Report a failure that the app already caught.
 *
 * Sits alongside `console.error` rather than replacing it: the console is what a
 * developer reads while working, and this is what gets read afterwards.
 */
export function reportError(
  err: unknown,
  context?: string,
  source: ErrorSource = 'handled'
): void {
  // No project configured means local-only mode, where there is nowhere to send
  // and nothing is expected to work anyway.
  if (!firestore) return;

  const report = buildReport({
    source,
    err,
    pathname: window.location.pathname,
    context: context ?? null,
    now: Date.now(),
  });

  if (!shouldSend(budget, report)) return;
  // Counted before the await so a burst inside one tick cannot all pass the check
  // and send together.
  budget = recordSent(budget, report);

  addDoc(collection(firestore, COLLECTION), {
    ...report,
    // Ties reports to an account without asking for anything extra. Absent when
    // signed out, which is itself worth knowing.
    uid: auth?.currentUser?.uid ?? null,
    // Client clocks are wrong often enough that ordering on `at` alone misleads.
    receivedAt: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 300),
  }).catch(() => {
    budget = recordFailure(budget);
  });
}

/**
 * Hook the two global failure channels.
 *
 * These are what catch the failures nobody wrote a handler for, which are exactly
 * the ones currently invisible. Idempotent, because React StrictMode mounts twice
 * in development.
 */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    // Resource load failures (a broken <img>) also fire this, with no error
    // object. They are noise here.
    if (!event.error) return;
    reportError(event.error, undefined, 'window.onerror');
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, undefined, 'unhandledrejection');
  });
}

/** Test seam: resets the session budget. */
export function __resetBeaconBudgetForTests(): void {
  budget = EMPTY_BUDGET;
}
