import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimitedError, rateLimitMessage } from '../lib/errors';
import { FEEDBACK_CAP } from '../lib/rateLimit';

/** RL-286: submitFeedback, mocked at the SDK boundary like firestore.cookbook.test.ts. */

type Op = { op: 'set' | 'update'; path: string; data: Record<string, unknown> };
let ops: Op[] = [];
let windowDoc: { windowStart: { toMillis: () => number }; count: number; last?: string } | null = null;
let hang = false;
const reportError = vi.fn();

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: { currentUser: { uid: 'u1' } }, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (first: { path?: string }, ...segments: string[]) =>
    segments.length ? { path: segments.join('/'), id: segments.at(-1) } : { path: `${first.path}/f1`, id: 'f1' },
  serverTimestamp: () => 'SERVER_TS',
  getDoc: async () => ({ exists: () => windowDoc != null, data: () => windowDoc ?? undefined }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (hang) return new Promise(() => {});
    const staged: Op[] = [];
    const out = await fn({
      get: async () => ({ exists: () => windowDoc != null, data: () => windowDoc ?? undefined }),
      set: (r: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'set', path: r.path, data }),
      update: (r: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: r.path, data }),
    });
    ops.push(...staged);
    return out;
  },
}));

import { submitFeedback } from './firestore';

const user = { uid: 'u1', displayName: 'Sam' };
const context = { path: '/library', appVersion: '0.4.0', viewport: '390x844', theme: 'light' as const, userAgent: 'UA' };
const SHOT = 'data:image/jpeg;base64,AAAA';

beforeEach(() => {
  ops = [];
  windowDoc = null;
  hang = false;
  reportError.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('submitFeedback (RL-286)', () => {
  it('writes exactly the rules keys and starts the feedback window', async () => {
    const id = await submitFeedback(user, { note: '  Nice  ', screenshot: SHOT }, context);
    expect(id).toBe('f1');
    expect(ops).toEqual([
      {
        op: 'set',
        path: 'feedback/f1',
        data: { uid: 'u1', displayName: 'Sam', note: 'Nice', ...context, screenshot: SHOT, createdAt: 'SERVER_TS' },
      },
      { op: 'set', path: 'writeWindows/u1_feedback', data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: 'feedback/f1' } },
    ]);
    expect(Object.keys(ops[0].data).sort()).toEqual(
      ['appVersion', 'createdAt', 'displayName', 'note', 'path', 'screenshot', 'theme', 'uid', 'userAgent', 'viewport']
    );
  });

  it('stores a missing screenshot and display name as null and increments an open window', async () => {
    windowDoc = { windowStart: { toMillis: () => Date.now() - 1000 }, count: 4 };
    await submitFeedback({ uid: 'u1', displayName: null }, { note: 'x', screenshot: null }, context);
    expect(ops[0].data).toMatchObject({ screenshot: null, displayName: null });
    expect(ops[1]).toEqual({ op: 'update', path: 'writeWindows/u1_feedback', data: { count: 5, at: 'SERVER_TS', last: 'feedback/f1' } });
  });

  it('throws the feedback rate-limit error at the cap, writes nothing and reports once', async () => {
    windowDoc = { windowStart: { toMillis: () => Date.now() - 1000 }, count: FEEDBACK_CAP };
    const err = await submitFeedback(user, { note: 'x', screenshot: null }, context).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(rateLimitMessage(err)).toBe("You've sent a lot of feedback today. Thank you. Try again tomorrow.");
    expect(ops).toEqual([]);
    expect(JSON.stringify(reportError.mock.calls)).not.toContain('data:image');
    expect(JSON.stringify(reportError.mock.calls)).not.toContain('"x"');
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toBe('rate-limited-feedback');
  });

  it('a retry with the same id after a landed commit writes nothing and spends no second slot', async () => {
    windowDoc = { windowStart: { toMillis: () => Date.now() - 1000 }, count: 3, last: 'feedback/draft1' };
    const id = await submitFeedback(user, { note: 'x', screenshot: null }, context, 'draft1');
    expect(id).toBe('draft1');
    expect(ops).toEqual([]);
  });

  it('a first send under a kept id writes the document at that id', async () => {
    await submitFeedback(user, { note: 'x', screenshot: null }, context, 'draft2');
    expect(ops.map((o) => o.path)).toEqual(['feedback/draft2', 'writeWindows/u1_feedback']);
  });

  it('refuses a screenshot that is not a JPEG data URL', async () => {
    await expect(submitFeedback(user, { note: 'x', screenshot: 'data:image/png;base64,AAAA' }, context)).rejects.toThrow();
    expect(ops).toEqual([]);
  });

  it('refuses a blank note and an oversized screenshot before any write', async () => {
    await expect(submitFeedback(user, { note: '  \n ', screenshot: null }, context)).rejects.toThrow();
    await expect(submitFeedback(user, { note: 'x', screenshot: SHOT + 'A'.repeat(200000) }, context)).rejects.toThrow();
    expect(ops).toEqual([]);
  });

  it('rejects after 15 s, not 5 s', async () => {
    vi.useFakeTimers();
    hang = true;
    const p = submitFeedback(user, { note: 'x', screenshot: null }, context).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(14_000);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(((await p) as Error).message).toMatch(/timed out/);
  });
});
