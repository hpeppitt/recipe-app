import { describe, it, expect, vi, beforeEach } from 'vitest';

/** RL-258: reading and following a public cookbook, mocked at the SDK boundary like firestore.collections.test.ts. */

type Op = { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> };
let ops: Op[] = [];
let committed = 0;
let stored: Record<string, Record<string, unknown>> = {};
let denied = false;

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
  writeBatch: () => ({
    set: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: 'set', path: r.path, data }),
    update: (r: { path: string }, data: Record<string, unknown>) => ops.push({ op: 'update', path: r.path, data }),
    delete: (r: { path: string }) => ops.push({ op: 'delete', path: r.path }),
    commit: async () => void committed++,
  }),
}));

import { getPublicCookbook, isFollowingCookbook, setCookbookFollow } from './firestore';

beforeEach(() => {
  ops = [];
  committed = 0;
  stored = {};
  denied = false;
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
