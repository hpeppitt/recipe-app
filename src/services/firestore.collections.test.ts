import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COLLECTION_RECIPE_CAP, CollectionRefusedError } from '../lib/kitchen';

/**
 * RL-222: the collections service, mocked at the SDK boundary like firestore.kitchen.test.ts.
 * The rules side is RL-211's and is emulator-checked.
 */

type Op = { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> };
let stored: Record<string, Record<string, unknown>> = {};
let ops: Op[] = [];
let hang = false;
let queried: unknown = null;
const authState = vi.hoisted(() => ({ currentUser: { uid: 'u1' } as { uid: string } | null }));

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: authState, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => {
  const never = <T,>(p: Promise<T>) => (hang ? new Promise<T>(() => {}) : p);
  return {
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (parent: { path?: string }, ...segments: string[]) => {
      const path = segments.length ? segments.join('/') : `${parent.path}/auto1`;
      return { path, id: path.split('/').at(-1) };
    },
    query: (ref: { path: string }, ...constraints: unknown[]) => ({ ...ref, constraints }),
    where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
    serverTimestamp: () => 'SERVER_TS',
    arrayUnion: (v: unknown) => ({ union: v }),
    arrayRemove: (v: unknown) => ({ remove: v }),
    setDoc: (ref: { path: string }, data: Record<string, unknown>) => never(Promise.resolve(void ops.push({ op: 'set', path: ref.path, data }))),
    updateDoc: (ref: { path: string }, data: Record<string, unknown>) => never(Promise.resolve(void ops.push({ op: 'update', path: ref.path, data }))),
    deleteDoc: (ref: { path: string }) => never(Promise.resolve(void ops.push({ op: 'delete', path: ref.path }))),
    onSnapshot: (q: unknown, next: (s: unknown) => void) => {
      queried = q;
      next({
        docs: Object.entries(stored).map(([path, data]) => ({ id: path.split('/')[1], data: () => data })),
      });
      return () => {};
    },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      if (hang) return new Promise(() => {});
      const staged: Op[] = [];
      await fn({
        get: async (ref: { path: string }) => {
          const data = stored[ref.path];
          return { exists: () => data != null, data: () => data };
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
      });
      ops = staged;
    },
  };
});

import { addToCollection, createCollection, deleteCollection, removeFromCollection, renameCollection, subscribeCollections } from './firestore';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

beforeEach(() => {
  stored = {};
  ops = [];
  hang = false;
  authState.currentUser = { uid: 'u1' };
});

describe('createCollection', () => {
  it('writes exactly the rules keys, private, with two server timestamps', async () => {
    expect(await createCollection('  Weeknights ', 'r1')).toBe('auto1');
    expect(ops).toEqual([
      {
        op: 'set',
        path: 'collections/auto1',
        data: { ownerUid: 'u1', name: 'Weeknights', visibility: 'private', recipeIds: ['r1'], createdAt: 'SERVER_TS', updatedAt: 'SERVER_TS' },
      },
    ]);
  });

  it('starts empty without a first recipe', async () => {
    await createCollection('Soups');
    expect(ops[0].data?.recipeIds).toEqual([]);
  });

  it('refuses a bad name or recipe id without writing', async () => {
    await expect(createCollection('  ')).rejects.toThrow('Give it a name.');
    await expect(createCollection('x'.repeat(61))).rejects.toThrow('Keep it under 60 characters.');
    await expect(createCollection('Soups', 'x'.repeat(37))).rejects.toBeInstanceOf(CollectionRefusedError);
    expect(ops).toEqual([]);
  });

  it('refuses when signed out', async () => {
    authState.currentUser = null;
    await expect(createCollection('Soups')).rejects.toThrow('Sign in');
  });

  it('rejects after 5 s when the write cannot reach the server', async () => {
    vi.useFakeTimers();
    hang = true;
    const p = createCollection('Soups');
    const assertion = expect(p).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('renameCollection', () => {
  it('updates only name and updatedAt', async () => {
    await renameCollection('c1', ' Pasta ');
    expect(ops).toEqual([{ op: 'update', path: 'collections/c1', data: { name: 'Pasta', updatedAt: 'SERVER_TS' } }]);
  });

  it('refuses a bad name without writing', async () => {
    await expect(renameCollection('c1', '')).rejects.toThrow('Give it a name.');
    expect(ops).toEqual([]);
  });
});

describe('deleteCollection', () => {
  it('deletes the document', async () => {
    await deleteCollection('c1');
    expect(ops).toEqual([{ op: 'delete', path: 'collections/c1' }]);
  });
});

describe('addToCollection', () => {
  it('adds with arrayUnion and sets updatedAt', async () => {
    stored['collections/c1'] = { ownerUid: 'u1', recipeIds: ['r0'] };
    await addToCollection('c1', 'r1');
    expect(ops).toEqual([{ op: 'update', path: 'collections/c1', data: { recipeIds: { union: 'r1' }, updatedAt: 'SERVER_TS' } }]);
  });

  it('does not write when the recipe is already there', async () => {
    stored['collections/c1'] = { ownerUid: 'u1', recipeIds: ['r1'] };
    await addToCollection('c1', 'r1');
    expect(ops).toEqual([]);
  });

  it('allows the 200th recipe and refuses the 201st against the stored list', async () => {
    stored['collections/c1'] = { ownerUid: 'u1', recipeIds: ids(COLLECTION_RECIPE_CAP - 1) };
    await addToCollection('c1', 'new');
    expect(ops).toHaveLength(1);
    ops = [];
    stored['collections/c1'] = { ownerUid: 'u1', recipeIds: ids(COLLECTION_RECIPE_CAP) };
    await expect(addToCollection('c1', 'new')).rejects.toThrow('This collection is full.');
    expect(ops).toEqual([]);
  });

  it('refuses a collection that no longer exists without writing', async () => {
    await expect(addToCollection('gone', 'r1')).rejects.toThrow('That collection no longer exists.');
    expect(ops).toEqual([]);
  });

  it('refuses a recipe id over 36 characters without writing', async () => {
    stored['collections/c1'] = { ownerUid: 'u1', recipeIds: [] };
    await expect(addToCollection('c1', 'x'.repeat(37))).rejects.toBeInstanceOf(CollectionRefusedError);
    expect(ops).toEqual([]);
  });

  it('rejects after 5 s when the transaction cannot reach the server', async () => {
    vi.useFakeTimers();
    hang = true;
    const p = addToCollection('c1', 'r1');
    const assertion = expect(p).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('removeFromCollection', () => {
  it('removes with arrayRemove and sets updatedAt', async () => {
    await removeFromCollection('c1', 'r1');
    expect(ops).toEqual([{ op: 'update', path: 'collections/c1', data: { recipeIds: { remove: 'r1' }, updatedAt: 'SERVER_TS' } }]);
  });
});

describe('subscribeCollections', () => {
  it('queries ownerUid equality only and sorts newest change first', () => {
    stored['collections/a'] = { ownerUid: 'u1', name: 'Old', recipeIds: [], updatedAt: { toMillis: () => 1 } };
    stored['collections/b'] = { ownerUid: 'u1', name: 'New', recipeIds: ['r1'], updatedAt: { toMillis: () => 9 } };
    let seen: unknown[] = [];
    subscribeCollections('u1', (c) => (seen = c));
    expect(queried).toEqual({ path: 'collections', constraints: [{ where: ['ownerUid', '==', 'u1'] }] });
    expect(seen).toEqual([
      { id: 'b', ownerUid: 'u1', name: 'New', recipeIds: ['r1'], createdAt: null, updatedAt: 9 },
      { id: 'a', ownerUid: 'u1', name: 'Old', recipeIds: [], createdAt: null, updatedAt: 1 },
    ]);
  });
});
