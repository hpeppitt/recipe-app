import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRecipe } from '../test/factories';

/**
 * The Firestore layer can't be exercised against a real backend here (no
 * credentials, and the emulator needs a JVM that isn't installed), so the SDK is
 * mocked at the module boundary. These tests pin the *contract* of the
 * favourite-removal fix rather than Firestore's own semantics: the favourite
 * record must come off even when the counter update fails, which is what
 * batching the two operations together prevented.
 */

const deleteDoc = vi.fn(async () => {});
const updateDoc = vi.fn(async () => {});
const getDocs = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ docs: [] }));
const reportError = vi.fn();
vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

type Fn = ReturnType<typeof vi.fn>;
type MockBatch = { set: Fn; update: Fn; delete: Fn; commit: Fn };
const batches: MockBatch[] = [];
let commitImpl: (batch: MockBatch) => Promise<void> = async () => {};

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  // Record the target path so assertions can tell favourites from recipes.
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: (...args: unknown[]) => getDocs(...args),
  setDoc: vi.fn(async () => {}),
  addDoc: vi.fn(async () => {}),
  updateDoc: (...args: unknown[]) => updateDoc(...(args as [])),
  deleteDoc: (...args: unknown[]) => deleteDoc(...(args as [])),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  onSnapshot: vi.fn(() => () => {}),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => {
    const batch: MockBatch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => commitImpl(batch)),
    };
    batches.push(batch);
    return batch;
  },
  arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
}));

const { removeCloudFavorite, pushLocalFavoritesToCloud, getCloudFavorites } = await import('./firestore');
const { db } = await import('../db/database');

beforeEach(() => {
  deleteDoc.mockClear();
  updateDoc.mockClear();
  updateDoc.mockImplementation(async () => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('removeCloudFavorite', () => {
  it('deletes the favourite and decrements the counter on the happy path', async () => {
    await removeCloudFavorite('alice', 'recipe-1');

    expect(deleteDoc).toHaveBeenCalledWith({ path: 'favorites/alice_recipe-1' });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'recipes/recipe-1' },
      { favoriteCount: { __increment: -1 } }
    );
  });

  // The FUN-8 defect: batching meant a missing recipe doc rejected the update
  // and rolled back the favourite deletion, so it could never be removed.
  it('still removes the favourite when the recipe no longer exists', async () => {
    updateDoc.mockRejectedValueOnce(new Error('No document to update: recipes/recipe-1'));

    await expect(removeCloudFavorite('alice', 'recipe-1')).resolves.toBeUndefined();

    expect(deleteDoc).toHaveBeenCalledWith({ path: 'favorites/alice_recipe-1' });
  });

  it('deletes the favourite before touching the counter', async () => {
    const order: string[] = [];
    deleteDoc.mockImplementationOnce(async () => {
      order.push('delete-favorite');
    });
    updateDoc.mockImplementationOnce(async () => {
      order.push('update-counter');
    });

    await removeCloudFavorite('alice', 'recipe-1');

    expect(order).toEqual(['delete-favorite', 'update-counter']);
  });

  it('propagates a failure to delete the favourite, since that is the real work', async () => {
    deleteDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(removeCloudFavorite('alice', 'recipe-1')).rejects.toThrow('permission-denied');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('builds the favourite id as {uid}_{recipeId}, matching the rules', async () => {
    await removeCloudFavorite('user-9', 'abc-123');

    expect(deleteDoc).toHaveBeenCalledWith({ path: 'favorites/user-9_abc-123' });
  });
});

describe('pushLocalFavoritesToCloud', () => {
  beforeEach(async () => {
    batches.length = 0;
    commitImpl = async () => {};
    await db.favorites.clear();
    await db.recipes.clear();
  });

  const seed = (...ids: string[]) =>
    db.favorites.bulkPut(ids.map((recipeId, i) => ({ uid: 'me', recipeId, createdAt: 100 + i })));

  it('writes nothing for an empty list', async () => {
    await db.favorites.put({ uid: 'someone-else', recipeId: 'x', createdAt: 1 });

    await expect(pushLocalFavoritesToCloud('me')).resolves.toEqual({ attempted: 0, pushed: 0, skipped: 0 });
    expect(batches).toHaveLength(0);
  });

  it('commits one batch per favourite with the create and the +1 bump', async () => {
    await seed('a', 'b');
    await db.recipes.put(makeRecipe({ id: 'a', createdBy: { uid: 'owner-a', displayName: null } }));

    await expect(pushLocalFavoritesToCloud('me')).resolves.toEqual({ attempted: 2, pushed: 2, skipped: 0 });

    expect(batches).toHaveLength(2);
    expect(batches[0].set).toHaveBeenCalledWith(
      { path: 'favorites/me_a' },
      { uid: 'me', recipeId: 'a', recipeOwnerId: 'owner-a', createdAt: 100 }
    );
    expect(batches[0].update).toHaveBeenCalledWith({ path: 'recipes/a' }, { favoriteCount: { __increment: 1 } });
    expect(batches[1].set).toHaveBeenCalledWith(
      { path: 'favorites/me_b' },
      { uid: 'me', recipeId: 'b', recipeOwnerId: 'local', createdAt: 101 }
    );
    expect(batches[1].update).toHaveBeenCalledWith({ path: 'recipes/b' }, { favoriteCount: { __increment: 1 } });
    for (const b of batches) expect(b.commit).toHaveBeenCalledTimes(1);
  });

  it('runs the batches one at a time', async () => {
    await seed('a', 'b', 'c');
    let inFlight = 0;
    let maxInFlight = 0;
    commitImpl = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    };

    await pushLocalFavoritesToCloud('me');

    expect(batches).toHaveLength(3);
    expect(maxInFlight).toBe(1);
  });

  it('counts a rejected batch as skipped and carries on with the rest', async () => {
    await seed('a', 'b', 'c');
    commitImpl = async (batch) => {
      if (batch === batches[1]) throw new Error('permission-denied');
    };

    await expect(pushLocalFavoritesToCloud('me')).resolves.toEqual({ attempted: 3, pushed: 2, skipped: 1 });
    expect(batches).toHaveLength(3);
    for (const b of batches) expect(b.commit).toHaveBeenCalledTimes(1);
  });

  it('counts a timed-out batch as skipped', async () => {
    await seed('a', 'b');
    // Only setTimeout, which withTimeout uses; fake-indexeddb needs the real setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      commitImpl = (batch) => (batch === batches[0] ? new Promise(() => {}) : Promise.resolve());

      const run = pushLocalFavoritesToCloud('me');
      await vi.waitFor(() => expect(batches).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(5000);

      await expect(run).resolves.toEqual({ attempted: 2, pushed: 1, skipped: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the local favourites untouched', async () => {
    await seed('a', 'b');
    commitImpl = async () => {
      throw new Error('permission-denied');
    };

    await pushLocalFavoritesToCloud('me');

    expect(await db.favorites.where('uid').equals('me').count()).toBe(2);
  });
});

describe('getCloudFavorites', () => {
  beforeEach(() => {
    getDocs.mockReset();
    reportError.mockClear();
    deleteDoc.mockClear();
    updateDoc.mockClear();
    batches.length = 0;
  });

  it("queries the user's own favourites with a single uid filter and returns the doc data", async () => {
    const row = { uid: 'me', recipeId: 'a', recipeOwnerId: 'o', createdAt: 7 };
    getDocs.mockResolvedValueOnce({ docs: [{ data: () => row }] });

    await expect(getCloudFavorites('me')).resolves.toEqual([row]);

    expect(getDocs).toHaveBeenCalledWith([{ path: 'favorites' }, ['uid', '==', 'me']]);
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(batches).toHaveLength(0);
  });

  it('reports a failed read and resolves null instead of throwing', async () => {
    getDocs.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(getCloudFavorites('me')).resolves.toBeNull();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'favorites-hydrate');
  });

  it('resolves null when the read hangs past the bound', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getDocs.mockReturnValueOnce(new Promise(() => {}));
      const run = getCloudFavorites('me');
      await vi.advanceTimersByTimeAsync(8000);
      await expect(run).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
