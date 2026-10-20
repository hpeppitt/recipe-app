import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FamilyMoveRefusedError } from '../lib/errors';
import { MAX_FAMILY_MOVE } from '../lib/tree';

/** Mocked at the SDK boundary, as in firestore.deleteVersion.test.ts. Pins the RL-164 batch. */

type Data = Record<string, unknown>;
let cloud: Record<string, Data> = {};
const ops: [string, string, Data?][] = [];
const commit = vi.fn(async () => {});
const notices: Data[] = [];

const report = vi.fn();
vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => report(...a) }));
vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));

vi.mock('firebase/firestore', () => ({
  // doc(collection(...)) mints an id under the collection's path.
  doc: (base: { path?: string }, ...segments: string[]) => ({ path: [base.path, ...segments].filter(Boolean).join('/'), id: segments[segments.length - 1] }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  serverTimestamp: () => 'ts',
  // Only the family query (rootId ==) is used here.
  getDocs: async (q: [unknown, [string, string, string]]) => ({
    docs: Object.entries(cloud)
      .filter(([path, d]) => path.startsWith('recipes/') && d.rootId === q[1][2])
      .map(([path, d]) => ({ id: path.slice(8), data: () => d })),
  }),
  getDoc: async (ref: { path: string; id: string }) => ({ id: ref.id, exists: () => ref.path in cloud, data: () => cloud[ref.path] }),
  getCountFromServer: async () => ({ data: () => ({ count: 2 }) }),
  // Both the move and the notification window run here: recipe updates go to `ops`, notices to `notices`.
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const staged: [string, string, Data?][] = [];
    const out = await fn({
      get: async (ref: { path: string; id: string }) => ({
        id: ref.id,
        exists: () => ref.path in cloud,
        data: () => cloud[ref.path],
      }),
      set: (ref: { path: string }, d: Data) => {
        if (ref.path.startsWith('notifications')) notices.push(d);
      },
      update: (ref: { path: string }, d: Data) => {
        if (ref.path.startsWith('recipes/')) staged.push(['update', ref.path, d]);
      },
    });
    if (staged.length) {
      await commit();
      ops.push(...staged);
      for (const [, path, d] of staged) cloud[path] = { ...cloud[path], ...d };
    }
    return out;
  },
}));

const { moveIntoFamily, getRelatedFamilies, FAMILY_MOVE_OTHERS_MESSAGE } = await import('./firestore');

const mine = (d: Data): Data => ({ createdBy: { uid: 'alice', displayName: 'Alice' }, title: 'Mine', emoji: '🍲', ...d });

beforeEach(() => {
  ops.length = 0;
  notices.length = 0;
  commit.mockReset();
  commit.mockImplementation(async () => {});
  cloud = {
    'recipes/t': { rootId: 't', parentId: null, depth: 0, createdBy: { uid: 'bob', displayName: 'Bob' }, title: 'Tomato Soup', emoji: '🍅' },
    'recipes/n': mine({ rootId: 'n', parentId: null, depth: 0, prompt: 'a red soup', relatedFamilyId: 't' }),
    'recipes/a': mine({ rootId: 'n', parentId: 'n', depth: 1 }),
  };
});

describe('moveIntoFamily', () => {
  it('commits one transaction of owner updates, then notifies the target family author', async () => {
    const { changes, leftBehind } = await moveIntoFamily('alice', 'Alice', 'n', 't');

    expect(commit).toHaveBeenCalledTimes(1);
    expect(ops).toEqual([
      ['update', 'recipes/n', { parentId: 't', rootId: 't', depth: 1, relatedFamilyId: null }],
      ['update', 'recipes/a', { parentId: 'n', rootId: 't', depth: 2, relatedFamilyId: null }],
    ]);
    expect(changes.map((c) => c.id)).toEqual(['n', 'a']);
    expect(leftBehind).toBe(0);
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toMatchObject({
      recipientUid: 'bob',
      type: 'branch',
      recipeId: 'n',
      recipeTitle: 'Tomato Soup',
      fromUid: 'alice',
      message: 'a red soup',
    });
  });

  it('refuses, writing nothing, when any version in the family is another cook\'s', async () => {
    cloud['recipes/c'] = { rootId: 'n', parentId: 'a', depth: 2, createdBy: { uid: 'carol' } };
    await expect(moveIntoFamily('alice', 'Alice', 'n', 't')).rejects.toThrow(FAMILY_MOVE_OTHERS_MESSAGE);
    expect(commit).not.toHaveBeenCalled();
  });

  it('refuses a mover who is not the author, a branch, a missing target or the same family', async () => {
    await expect(moveIntoFamily('bob', 'Bob', 'n', 't')).rejects.toBeInstanceOf(FamilyMoveRefusedError);
    await expect(moveIntoFamily('alice', 'Alice', 'a', 't')).rejects.toBeInstanceOf(FamilyMoveRefusedError);
    await expect(moveIntoFamily('alice', 'Alice', 'n', 'gone')).rejects.toBeInstanceOf(FamilyMoveRefusedError);
    await expect(moveIntoFamily('alice', 'Alice', 'n', 'a')).rejects.toBeInstanceOf(FamilyMoveRefusedError);
    expect(commit).not.toHaveBeenCalled();
  });

  it('refuses above MAX_FAMILY_MOVE versions, writing nothing', async () => {
    for (let i = 0; i < MAX_FAMILY_MOVE; i++) cloud[`recipes/b${i}`] = mine({ rootId: 'n', parentId: 'n', depth: 1 });
    await expect(moveIntoFamily('alice', 'Alice', 'n', 't')).rejects.toThrow('too many versions');
    expect(commit).not.toHaveBeenCalled();
  });

  it('does not notify the mover about their own family', async () => {
    cloud['recipes/t'] = mine({ rootId: 't', parentId: null, depth: 0 });
    await moveIntoFamily('alice', 'Alice', 'n', 't');
    await new Promise((r) => setTimeout(r, 0));
    expect(notices).toEqual([]);
  });

  it('rethrows a failed commit', async () => {
    commit.mockRejectedValue(new Error('permission-denied'));
    await expect(moveIntoFamily('alice', 'Alice', 'n', 't')).rejects.toThrow('permission-denied');
    expect(notices).toEqual([]);
  });

  it('refuses inside the transaction when a version changed owner after the first read', async () => {
    commit.mockImplementationOnce(async () => {});
    const realA = cloud['recipes/a'];
    // The pre-read sees alice's branch; by the transaction it is carol's.
    const read = { n: 0 };
    Object.defineProperty(cloud, 'recipes/a', {
      configurable: true,
      enumerable: true,
      get: () => (read.n++ < 1 ? realA : { ...realA, createdBy: { uid: 'carol' } }),
    });
    await expect(moveIntoFamily('alice', 'Alice', 'n', 't')).rejects.toThrow(FAMILY_MOVE_OTHERS_MESSAGE);
    expect(ops).toEqual([]);
  });

  it('counts versions another cook left in the old family', async () => {
    commit.mockImplementationOnce(async () => {
      cloud['recipes/late'] = { rootId: 'n', parentId: 'n', depth: 1, createdBy: { uid: 'carol' } };
    });
    expect((await moveIntoFamily('alice', 'Alice', 'n', 't')).leftBehind).toBe(1);
    expect(report).toHaveBeenCalledWith(expect.any(Error), 'family-move-left-behind');
  });

  it('treats an original already under the target as moved, with no second notice', async () => {
    await moveIntoFamily('alice', 'Alice', 'n', 't');
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    commit.mockClear();
    const again = await moveIntoFamily('alice', 'Alice', 'n', 't');
    expect(again.changes).toEqual([
      { id: 'n', parentId: 't', rootId: 't', depth: 1 },
      { id: 'a', parentId: 'n', rootId: 't', depth: 2 },
    ]);
    expect(commit).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(notices).toHaveLength(1);
  });

  it('uses a branch target\'s root and a whole-number depth, and refuses one with no rootId', async () => {
    cloud['recipes/tb'] = { rootId: 't', parentId: 't', depth: 'x', createdBy: { uid: 'bob' }, title: 'Tomato Twist', emoji: '🍅' };
    const { changes } = await moveIntoFamily('alice', 'Alice', 'n', 'tb');
    expect(changes[0]).toEqual({ id: 'n', parentId: 'tb', rootId: 't', depth: 1 });

    cloud['recipes/n'] = mine({ rootId: 'n', parentId: null, depth: 0 });
    cloud['recipes/nr'] = { parentId: 't', createdBy: { uid: 'bob' }, title: 'No root' };
    await expect(moveIntoFamily('alice', 'Alice', 'n', 'nr')).rejects.toBeInstanceOf(FamilyMoveRefusedError);
  });
});

describe('getRelatedFamilies', () => {
  it('shows the root of a linked original that has since moved into another family', async () => {
    cloud['recipes/n'] = mine({ rootId: 't', parentId: 't', depth: 1 });
    const rows = await getRelatedFamilies({ id: 'x', depth: 0, relatedFamilyId: 'n' });
    expect(rows.map((r) => r.id)).toEqual(['t']);
  });

  it('hides a link into the recipe\'s own family', async () => {
    cloud['recipes/a'] = mine({ rootId: 'n', parentId: 'n', depth: 1 });
    expect(await getRelatedFamilies({ id: 'n', depth: 0, relatedFamilyId: 'a' })).toEqual([]);
  });
});
