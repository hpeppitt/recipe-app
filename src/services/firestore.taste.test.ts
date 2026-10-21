import { describe, it, expect, vi, beforeEach } from 'vitest';

type Op = { op: 'set'; path: string; data: Record<string, unknown> };
let stored: Record<string, Record<string, unknown>> = {};
let ops: Op[] = [];
let hang = false;

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: {}, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...s: string[]) => ({ path: s.join('/') }),
  serverTimestamp: () => 'SERVER_TS',
  getDoc: async (ref: { path: string }) => ({ exists: () => stored[ref.path] != null, data: () => stored[ref.path] }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (hang) return new Promise(() => {});
    return fn({
      get: async (ref: { path: string }) => ({ exists: () => stored[ref.path] != null, data: () => stored[ref.path] }),
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push({ op: 'set', path: ref.path, data }),
    });
  },
}));

import { getTasteProfile, saveTasteProfile } from './firestore';

beforeEach(() => {
  stored = {};
  ops = [];
  hang = false;
  vi.useRealTimers();
});

describe('getTasteProfile', () => {
  it('is empty when there is no document', async () => {
    expect(await getTasteProfile('u1')).toEqual({ avoids: [], hidden: [], askedAt: null });
  });

  it('drops non-string and over-length hidden entries and bad askedAt on read', async () => {
    stored['tasteProfiles/u1'] = { avoids: ['Nuts'], hidden: ['Curry', 3, 'x'.repeat(41)], askedAt: 'soon' };
    expect(await getTasteProfile('u1')).toEqual({ avoids: ['Nuts'], hidden: ['Curry'], askedAt: null });
  });
});

describe('saveTasteProfile', () => {
  it('writes all four keys on create, even for a one-field patch', async () => {
    const saved = await saveTasteProfile('u1', () => ({ avoids: ['  fresh   CORIANDER '] }));
    expect(saved).toEqual({ avoids: ['Fresh coriander'], hidden: [], askedAt: null });
    expect(ops).toEqual([{ op: 'set', path: 'tasteProfiles/u1', data: { avoids: ['Fresh coriander'], hidden: [], askedAt: null, updatedAt: 'SERVER_TS' } }]);
  });

  it('keeps the stored fields the patch does not mention', async () => {
    stored['tasteProfiles/u1'] = { avoids: ['Nuts'], hidden: ['Curry'], askedAt: 5, updatedAt: 1 };
    await saveTasteProfile('u1', () => ({ askedAt: 9 }));
    expect(ops[0].data).toEqual({ avoids: ['Nuts'], hidden: ['Curry'], askedAt: 9, updatedAt: 'SERVER_TS' });
  });

  it('applies the update to the freshly read document and clamps askedAt to now', async () => {
    stored['tasteProfiles/u1'] = { avoids: ['Nuts'], hidden: [], askedAt: null };
    const saved = await saveTasteProfile('u1', (cur) => ({ avoids: [...cur.avoids, 'Dill'], askedAt: Date.now() + 1e9 }));
    expect(saved.avoids).toEqual(['Nuts', 'Dill']);
    expect(saved.askedAt).toBeLessThanOrEqual(Date.now());
  });

  it('rejects after 5 s when the transaction hangs', async () => {
    vi.useFakeTimers();
    hang = true;
    const p = saveTasteProfile('u1', () => ({ askedAt: 1 }));
    const assertion = expect(p).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});
