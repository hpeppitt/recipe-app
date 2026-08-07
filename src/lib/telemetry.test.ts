import { describe, it, expect } from 'vitest';
import {
  truncate,
  describeError,
  safeRoute,
  buildReport,
  fingerprint,
  shouldSend,
  recordSent,
  recordFailure,
  EMPTY_BUDGET,
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  MAX_REPORTS_PER_SESSION,
  BEACON_FAILURE_LIMIT,
  type BeaconBudget,
} from './telemetry';

const report = (over: Partial<Parameters<typeof buildReport>[0]> = {}) =>
  buildReport({ source: 'handled', err: new Error('boom'), pathname: '/', now: 1, ...over });

describe('truncate', () => {
  it('leaves short values alone', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  // A silently cut stack is one someone debugs as though it ended there.
  it('marks what it removed', () => {
    const out = truncate('x'.repeat(120), 100);
    expect(out.startsWith('x'.repeat(100))).toBe(true);
    expect(out).toContain('truncated 20 chars');
  });
});

describe('describeError', () => {
  it('takes message and stack from an Error', () => {
    const err = new Error('kaboom');
    const out = describeError(err);
    expect(out.message).toBe('kaboom');
    expect(out.stack).toContain('kaboom');
  });

  it('falls back to the name when an Error has no message', () => {
    expect(describeError(new TypeError()).message).toBe('TypeError');
  });

  // unhandledrejection rejects with whatever was passed, often not an Error.
  it('handles a thrown string', () => {
    expect(describeError('just a string')).toEqual({ message: 'just a string', stack: null });
  });

  it('serialises a thrown object', () => {
    expect(describeError({ code: 42 }).message).toBe('{"code":42}');
  });

  it('survives a circular value rather than throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).message).toBe('Unserialisable error value');
  });

  it('survives a getter that throws', () => {
    const hostile = {
      get boom() {
        throw new Error('nope');
      },
    };
    expect(describeError(hostile).message).toBe('Unserialisable error value');
  });

  it('truncates a huge message and stack', () => {
    const err = new Error('m'.repeat(MAX_MESSAGE_CHARS + 50));
    err.stack = 's'.repeat(MAX_STACK_CHARS + 50);
    const out = describeError(err);
    expect(out.message.length).toBeLessThan(MAX_MESSAGE_CHARS + 40);
    expect(out.stack!.length).toBeLessThan(MAX_STACK_CHARS + 40);
  });
});

describe('safeRoute', () => {
  it('passes a plain path through', () => {
    expect(safeRoute('/recipe/abc')).toBe('/recipe/abc');
  });

  it('defaults an empty path', () => {
    expect(safeRoute('')).toBe('/');
  });
});

describe('buildReport', () => {
  // The hash on /shared carries an entire lz-string recipe, and the sign-in path's
  // query carries a live oobCode. Neither belongs in diagnostics.
  it('records only the path, never query or hash', () => {
    const r = report({ pathname: '/shared' });
    expect(r.route).toBe('/shared');
    expect(JSON.stringify(r)).not.toContain('oobCode');
    expect(JSON.stringify(r)).not.toContain('#r=');
  });

  it('carries source, context and timestamp', () => {
    const r = report({ source: 'unhandledrejection', context: 'publish-recipe', now: 99 });
    expect(r.source).toBe('unhandledrejection');
    expect(r.context).toBe('publish-recipe');
    expect(r.at).toBe(99);
  });

  it('nulls an absent context rather than sending undefined', () => {
    expect(report().context).toBeNull();
  });
});

describe('shouldSend', () => {
  it('sends a fresh error', () => {
    expect(shouldSend(EMPTY_BUDGET, report())).toBe(true);
  });

  // An error inside a render can fire every frame. One report is the useful one.
  it('suppresses a repeat of the same failure', () => {
    const budget = recordSent(EMPTY_BUDGET, report());
    expect(shouldSend(budget, report())).toBe(false);
  });

  it('treats the same message on a different route as worth reporting', () => {
    const budget = recordSent(EMPTY_BUDGET, report({ pathname: '/a' }));
    expect(shouldSend(budget, report({ pathname: '/b' }))).toBe(true);
  });

  it('stops at the per-session cap', () => {
    const budget: BeaconBudget = { ...EMPTY_BUDGET, sent: MAX_REPORTS_PER_SESSION };
    expect(shouldSend(budget, report())).toBe(false);
  });

  it('opens the circuit breaker after repeated send failures', () => {
    let budget = EMPTY_BUDGET;
    for (let i = 0; i < BEACON_FAILURE_LIMIT; i++) budget = recordFailure(budget);
    expect(shouldSend(budget, report())).toBe(false);
  });
});

describe('recordSent / recordFailure', () => {
  it('a success resets the failure streak', () => {
    const budget = recordSent(recordFailure(EMPTY_BUDGET), report());
    expect(budget.consecutiveFailures).toBe(0);
    expect(budget.sent).toBe(1);
  });

  // The report never arrived, so a later attempt at the same failure is still
  // worth making, and it must not eat the session quota.
  it('a failure consumes neither quota nor fingerprint', () => {
    const budget = recordFailure(EMPTY_BUDGET);
    expect(budget.sent).toBe(0);
    expect(budget.seen).toEqual([]);
    expect(shouldSend(budget, report())).toBe(true);
  });
});

describe('fingerprint', () => {
  it('is stable for the same failure', () => {
    expect(fingerprint(report())).toBe(fingerprint(report()));
  });

  it('distinguishes source', () => {
    expect(fingerprint(report({ source: 'handled' }))).not.toBe(
      fingerprint(report({ source: 'window.onerror' }))
    );
  });
});
