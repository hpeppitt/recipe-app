/**
 * Shaping and rate-limiting for the client error beacon.
 *
 * Pure on purpose: the parts that decide *whether* to send and *what* a report
 * contains are the parts that can go wrong expensively, so they are testable
 * without a Firestore or a window.
 *
 * Context: nothing in this app reports a client-side failure. Several known
 * degradations are described in the docs as happening "silently" precisely
 * because there is no way to see them. This is the eyes.
 */

/** Where the failure came from, so reports can be triaged without reading text. */
export type ErrorSource =
  | 'window.onerror'
  | 'unhandledrejection'
  | 'handled';

export interface ErrorReport {
  source: ErrorSource;
  /** Truncated. Firestore documents are capped at 1 MiB and stack traces are long. */
  message: string;
  stack: string | null;
  /** Route only, never the full URL: a shared-recipe hash can carry a whole recipe. */
  route: string;
  /** Free-form tag from the call site, e.g. 'publish-recipe'. */
  context: string | null;
  at: number;
}

export const MAX_MESSAGE_CHARS = 500;
export const MAX_STACK_CHARS = 2000;

/**
 * Per-session send cap.
 *
 * An error inside a render can fire on every frame. Without a cap, a single bad
 * deploy turns every open tab into a writer hammering Firestore, which costs money
 * and buries the first, most useful report under thousands of duplicates.
 */
export const MAX_REPORTS_PER_SESSION = 10;

/** Consecutive beacon failures before giving up for the session. */
export const BEACON_FAILURE_LIMIT = 3;

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Marked rather than silently cut, so nobody debugs a stack that merely looks
  // like it ends there.
  return value.slice(0, max) + `…[truncated ${value.length - max} chars]`;
}

/**
 * Turns anything throwable into a message and stack.
 *
 * `unhandledrejection` in particular rejects with whatever the author passed,
 * which is frequently not an Error: strings, objects, and undefined all occur.
 */
export function describeError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return {
      message: truncate(err.message || err.name || 'Error', MAX_MESSAGE_CHARS),
      stack: err.stack ? truncate(err.stack, MAX_STACK_CHARS) : null,
    };
  }
  if (typeof err === 'string') {
    return { message: truncate(err, MAX_MESSAGE_CHARS), stack: null };
  }
  try {
    return { message: truncate(JSON.stringify(err) ?? 'Unknown error', MAX_MESSAGE_CHARS), stack: null };
  } catch {
    // Circular, or a getter that throws. Never let the reporter be the crash.
    return { message: 'Unserialisable error value', stack: null };
  }
}

/**
 * The route, without anything identifying or bulky.
 *
 * Deliberately drops the query string and hash. `/shared#r=<lz-string>` carries an
 * entire recipe in its hash, and query strings on the sign-in path carry a live
 * `oobCode`. Neither belongs in a diagnostics collection.
 */
export function safeRoute(pathname: string): string {
  return truncate(pathname || '/', 200);
}

export function buildReport(params: {
  source: ErrorSource;
  err: unknown;
  pathname: string;
  context?: string | null;
  now: number;
}): ErrorReport {
  const { message, stack } = describeError(params.err);
  return {
    source: params.source,
    message,
    stack,
    route: safeRoute(params.pathname),
    context: params.context ? truncate(params.context, 100) : null,
    at: params.now,
  };
}

export interface BeaconBudget {
  sent: number;
  consecutiveFailures: number;
  /** Fingerprints already reported this session. */
  seen: string[];
}

export const EMPTY_BUDGET: BeaconBudget = { sent: 0, consecutiveFailures: 0, seen: [] };

/**
 * Identity of a failure for deduplication.
 *
 * Message plus source plus route, not the stack: the same bug reached from two
 * routes is worth two reports, but the same bug firing sixty times on one screen
 * is worth one.
 */
export function fingerprint(report: ErrorReport): string {
  return `${report.source}|${report.route}|${report.message}`;
}

export function shouldSend(budget: BeaconBudget, report: ErrorReport): boolean {
  if (budget.consecutiveFailures >= BEACON_FAILURE_LIMIT) return false;
  if (budget.sent >= MAX_REPORTS_PER_SESSION) return false;
  return !budget.seen.includes(fingerprint(report));
}

export function recordSent(budget: BeaconBudget, report: ErrorReport): BeaconBudget {
  return {
    sent: budget.sent + 1,
    consecutiveFailures: 0,
    seen: [...budget.seen, fingerprint(report)],
  };
}

/**
 * A failed send counts against the circuit breaker but does not consume the
 * per-session quota, and does not mark the fingerprint seen: the report was never
 * delivered, so a later attempt at the same failure is still worth making.
 */
export function recordFailure(budget: BeaconBudget): BeaconBudget {
  return { ...budget, consecutiveFailures: budget.consecutiveFailures + 1 };
}
