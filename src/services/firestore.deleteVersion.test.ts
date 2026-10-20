import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRecipe } from '../test/factories';
import { TooManyMovedBranchesError } from '../lib/errors';
import { MAX_MOVED_CHILDREN } from '../lib/tree';

/** Mocked at the SDK boundary, as in firestore.deleteTree.test.ts. Pins the RL-159 batch. */

type Data = Record<string, unknown>;
let cloud: Record<string, Data> = {};
let server: Record<string, Data> | 'offline' = {};
const ops: [string, string, Data?][] = [];
const commit = vi.fn(async () => {});

vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), id: segments[segments.length - 1] }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  getDocs: async (q: [unknown, [string, string, string]]) => {
    const parentId = q[1][2];
    return {
      docs: Object.entries(cloud)
        .filter(([path, d]) => path.startsWith('recipes/') && d.parentId === parentId)
        .map(([path, d]) => ({ id: path.slice(8), data: () => d })),
    };
  },
  getDoc: async (ref: { path: string }) => ({ exists: () => ref.path in cloud, data: () => cloud[ref.path] }),
  // The server's view; tests set `server` to differ from the cache (`cloud`).
  getDocFromServer: async (ref: { path: string }) => {
    const view = server;
    if (view === 'offline') throw new Error('unavailable');
    return { exists: () => ref.path in view, data: () => view[ref.path] };
  },
  writeBatch: () => ({
    delete: (ref: { path: string }) => ops.push(['delete', ref.path]),
    update: (ref: { path: string }, d: Data) => ops.push(['update', ref.path, d]),
    set: (ref: { path: string }, d: Data) => ops.push(['set', ref.path, d]),
    commit,
  }),
}));

const { deletePublishedVersion, isRecipeGoneOnServer } = await import('./firestore');

const version = makeRecipe({ id: 'v', title: 'Spicy Soup', parentId: 'r', rootId: 'r', depth: 1, createdBy: { uid: 'alice', displayName: 'Alice' } });
const child = (uid: string, depth = 2): Data => ({ parentId: 'v', depth, createdBy: { uid }, title: `${uid} soup`, emoji: '🥣' });

beforeEach(() => {
  ops.length = 0;
  commit.mockReset();
  commit.mockImplementation(async () => {});
  // The stored depth of the other cook's child is stale (5): the batch must use it, not the device's.
  cloud = { 'recipes/v': { parentId: 'r' }, 'recipes/own': child('alice'), 'recipes/bobs': child('bob', 5) };
});

describe('deletePublishedVersion', () => {
  it('deletes the version, moves every direct child up, and tells only the other cooks', async () => {
    await deletePublishedVersion('alice', version, ['own', 'bobs']);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(ops.filter(([op]) => op !== 'set')).toEqual([
      ['delete', 'recipes/v'],
      ['update', 'recipes/own', { parentId: 'r', depth: 1 }],
      ['update', 'recipes/bobs', { parentId: 'r', depth: 4 }],
    ]);
    const notices = ops.filter(([op]) => op === 'set');
    expect(notices).toHaveLength(1);
    expect(notices[0][1]).toBe('notifications/moved_bobs_v');
    expect(notices[0][2]).toMatchObject({
      recipientUid: 'bob',
      type: 'moved',
      recipeId: 'bobs',
      recipeTitle: 'bob soup',
      fromUid: 'alice',
      fromDisplayName: 'Alice',
      message: 'Spicy Soup',
      read: false,
    });
  });

  it('does not retry when a fresh read finds the same children', async () => {
    commit.mockRejectedValue(new Error('permission-denied'));
    await expect(deletePublishedVersion('alice', version, [])).rejects.toThrow('permission-denied');
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('retries once when the children changed, and gives up after that', async () => {
    commit.mockImplementationOnce(async () => {
      delete cloud['recipes/own']; // a child moved away between the read and the commit
      throw new Error('not-found');
    });
    await deletePublishedVersion('alice', version, []);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(ops.filter(([op]) => op === 'update').at(-1)).toEqual(['update', 'recipes/bobs', { parentId: 'r', depth: 4 }]);

    commit.mockReset();
    commit.mockImplementation(async () => {
      cloud[`recipes/n${commit.mock.calls.length}`] = child('alice');
      throw new Error('permission-denied');
    });
    await expect(deletePublishedVersion('alice', version, [])).rejects.toThrow('permission-denied');
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('moves a malformed child without a notice: no string author, depth set to 0', async () => {
    cloud = { 'recipes/v': { parentId: 'r' }, 'recipes/odd': { parentId: 'v', createdBy: {}, title: 'Odd' } };
    await deletePublishedVersion('alice', version, []);
    expect(ops).toEqual([
      ['delete', 'recipes/v'],
      ['update', 'recipes/odd', { parentId: 'r', depth: 0 }],
    ]);
  });

  it('refuses above MAX_MOVED_CHILDREN other cooks, writing nothing', async () => {
    for (let i = 0; i <= MAX_MOVED_CHILDREN; i++) cloud[`recipes/o${i}`] = child(`cook${i}`);
    await expect(deletePublishedVersion('alice', version, [])).rejects.toBeInstanceOf(TooManyMovedBranchesError);
    expect(commit).not.toHaveBeenCalled();
  });

  it('writes nothing when the version has no cloud doc', async () => {
    delete cloud['recipes/v'];
    await deletePublishedVersion('alice', version, ['own']);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('isRecipeGoneOnServer', () => {
  it('trusts the server, not a cache that already shows the pending delete', async () => {
    cloud = {}; // the cache: the delete is applied locally
    server = { 'recipes/v': { parentId: 'r' } }; // the server: not committed
    expect(await isRecipeGoneOnServer('v')).toBe(false);
    server = {};
    expect(await isRecipeGoneOnServer('v')).toBe(true);
  });

  it('counts a failed server read as not gone', async () => {
    server = 'offline';
    expect(await isRecipeGoneOnServer('v')).toBe(false);
  });
});
