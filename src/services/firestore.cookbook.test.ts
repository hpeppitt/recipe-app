import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitedError, rateLimitMessage } from '../lib/errors';
import { COOKBOOK_CAP } from '../lib/rateLimit';

/** RL-258: reading and following a public cookbook, mocked at the SDK boundary like firestore.collections.test.ts. */

type Op = { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> };
let ops: Op[] = [];
let committed = 0;
let stored: Record<string, Record<string, unknown>> = {};
let denied = false;
let windowDoc: { windowStart: { toMillis: () => number }; count: number } | null = null;

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: { currentUser: { uid: 'u1' } }, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  serverTimestamp: () => 'SERVER_TS',
  increment: (n: number) => ({ inc: n }),
  getDoc: async (ref: { path: string }) => {
    if (denied) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    const data = stored[ref.path];
    return { id: ref.path.split('/').at(-1), exists: () => data != null, data: () => data };
  },
  updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
    ops.push({ op: 'update', path: r.path, data });
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const staged: Op[] = [];
    const out = await fn({
      get: async (ref: { path: string }) => {
        const data = ref.path.startsWith('writeWindows/') ? windowDoc : stored[ref.path];
        return { exists: () => data != null, data: () => data ?? undefined };
      },
      set: (r: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'set', path: r.path, data }),
      update: (r: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: r.path, data }),
    });
    ops.push(...staged);
    return out;
  },
  writeBatch: () => ({
    set: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: 'set', path: r.path, data }),
    update: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: 'update', path: r.path, data }),
    delete: (r: { path: string }) => ops.push({ op: 'delete', path: r.path }),
    commit: async () => void committed++,
  }),
}));

import { getPublicCookbook, isFollowingCookbook, setCookbookFollow, setCookbookSharing } from './firestore';

beforeEach(() => {
  ops = [];
  committed = 0;
  stored = {};
  denied = false;
  windowDoc = null;
});

describe('setCookbookSharing (RL-265)', () => {
  const NOW = Date.now();
  const privateBook = { ownerUid: 'u1', name: 'Soups', visibility: 'private', recipeIds: ['r1'], createdAt: 'T0', updatedAt: 'T1', followerCount: 3, lastAddedAt: 'T2', description: null };

  it('publishes through the cookbook window, keeping the stored fields', async () => {
    stored['collections/c1'] = privateBook;
    await setCookbookSharing('c1', 'public', 'Warm');
    expect(ops).toEqual([
      { op: 'set', path: 'collections/c1', data: { ...privateBook, visibility: 'public', description: 'Warm', updatedAt: 'SERVER_TS' } },
      { op: 'set', path: 'writeWindows/u1_cookbook', data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: 'collections/c1' } },
    ]);
  });

  it('increments an open window', async () => {
    stored['collections/c1'] = privateBook;
    windowDoc = { windowStart: { toMillis: () => NOW - 1000 }, count: 2 };
    await setCookbookSharing('c1', 'public', null);
    expect(ops[1]).toEqual({ op: 'update', path: 'writeWindows/u1_cookbook', data: { count: 3, at: 'SERVER_TS', last: 'collections/c1' } });
  });

  it('throws the cookbook rate-limit error at the cap, having written nothing', async () => {
    stored['collections/c1'] = privateBook;
    windowDoc = { windowStart: { toMillis: () => NOW - 1000 }, count: COOKBOOK_CAP };
    const err = await setCookbookSharing('c1', 'public', 'Warm').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(rateLimitMessage(err)).toBe("You've shared a lot of cookbooks today. Try again tomorrow.");
    expect(ops).toEqual([]);
  });

  it('answers not-found for a missing collection, having written nothing', async () => {
    const err = await setCookbookSharing('gone', 'public', null).catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('not-found');
    expect(ops).toEqual([]);
  });

  it('stops sharing with a plain update and no window, even at the cap', async () => {
    windowDoc = { windowStart: { toMillis: () => NOW - 1000 }, count: COOKBOOK_CAP };
    await setCookbookSharing('c1', 'private', 'Warm');
    expect(ops).toEqual([{ op: 'update', path: 'collections/c1', data: { visibility: 'private', description: 'Warm', updatedAt: 'SERVER_TS' } }]);
  });
});

describe('setCookbookFollow', () => {
  it('follows with exactly the rules keys and +1 in one batch', async () => {
    await setCookbookFollow('u1', 'c1', true, 2);
    expect(ops).toEqual([
      { op: 'set', path: 'cookbookFollows/u1_c1', data: { uid: 'u1', collectionId: 'c1', createdAt: 'SERVER_TS', lastSeenAt: 'SERVER_TS' } },
      { op: 'update', path: 'collections/c1', data: { followerCount: { inc: 1 } } },
    ]);
    expect(committed).toBe(1);
  });
  it('unfollows with -1 in one batch', async () => {
    await setCookbookFollow('u1', 'c1', false, 2);
    expect(ops).toEqual([
      { op: 'delete', path: 'cookbookFollows/u1_c1' },
      { op: 'update', path: 'collections/c1', data: { followerCount: { inc: -1 } } },
    ]);
    expect(committed).toBe(1);
  });
  it('never takes the count below 0', async () => {
    await setCookbookFollow('u1', 'c1', false, 0);
    expect(ops).toEqual([{ op: 'delete', path: 'cookbookFollows/u1_c1' }]);
  });
});

describe('getPublicCookbook', () => {
  it('reads one document and defaults followerCount to 0', async () => {
    stored['collections/c1'] = { ownerUid: 'o', name: 'Soups', visibility: 'public', recipeIds: ['r1'], description: 'Warm' };
    const r = await getPublicCookbook('c1');
    expect(r.status).toBe('ready');
    if (r.status === 'ready') expect(r.cookbook).toMatchObject({ name: 'Soups', followerCount: 0, description: 'Warm', recipeIds: ['r1'] });
  });
  it('answers unavailable for a private collection the owner can read', async () => {
    stored['collections/c1'] = { ownerUid: 'o', name: 'Soups', visibility: 'private', recipeIds: [] };
    expect(await getPublicCookbook('c1')).toEqual({ status: 'unavailable' });
  });
  it('answers unavailable for missing and for permission-denied', async () => {
    expect(await getPublicCookbook('nope')).toEqual({ status: 'unavailable' });
    denied = true;
    expect(await getPublicCookbook('c1')).toEqual({ status: 'unavailable' });
  });
});

describe('isFollowingCookbook', () => {
  it('is whether the follow document exists', async () => {
    expect(await isFollowingCookbook('u1', 'c1')).toBe(false);
    stored['cookbookFollows/u1_c1'] = { uid: 'u1' };
    expect(await isFollowingCookbook('u1', 'c1')).toBe(true);
  });
});
