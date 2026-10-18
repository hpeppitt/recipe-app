import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRecipe } from '../test/factories';

/**
 * SDK mocked at the module boundary — see firestore.favorites.test.ts for why a
 * real backend isn't available here. These pin the create/update distinction:
 * a re-publish must not touch favoriteCount, viewCount or profile recipeCount.
 */

const setDoc = vi.fn(async (..._args: unknown[]) => {});
const updateDoc = vi.fn(async (..._args: unknown[]) => {});
let docExists = false;
let getDocError: Error | null = null;

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  // RL-049: no auth here, so publishRecipe's signed-in-creator guard is skipped.
  auth: null,
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async () => {
    if (getDocError) throw getDocError;
    return { exists: () => docExists };
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
  addDoc: vi.fn(async () => {}),
  updateDoc: (...args: unknown[]) => updateDoc(...(args as [])),
  deleteDoc: vi.fn(async () => {}),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  onSnapshot: vi.fn(() => () => {}),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  }),
  arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
  // RL-049: the create path is a transaction with the recipe window. The window
  // is absent, and the recipe write is forwarded to the setDoc spy so the
  // first-publish assertions below still read it; firestore.writeLimits.test.ts
  // covers the transaction itself.
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const writes: unknown[][] = [];
    const result = await fn({
      get: async () => ({ exists: () => false }),
      set: (ref: { path: string }, data: unknown) => {
        if (!ref.path.startsWith('writeWindows/')) writes.push([ref, data]);
      },
      update: () => {},
    });
    for (const w of writes) await setDoc(...(w as []));
    return result;
  },
}));

const { publishRecipe } = await import('./firestore');

beforeEach(() => {
  setDoc.mockClear();
  updateDoc.mockClear();
  docExists = false;
  getDocError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('publishRecipe — first publish', () => {
  it('creates the doc with both counters zeroed, as the rules require', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' } }));

    const [ref, payload, options] = setDoc.mock.calls[0] as unknown as [
      { path: string },
      Record<string, unknown>,
      unknown,
    ];
    expect(ref.path).toBe('recipes/r1');
    expect(payload.favoriteCount).toBe(0);
    expect(payload.viewCount).toBe(0);
    expect(options).toBeUndefined();
  });

  it('a first publish by a real uid writes no profile update', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' } }));

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('does not bump a profile for the local placeholder uid', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid: 'local', displayName: null } }));

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('never writes chatHistory to the cloud', async () => {
    await publishRecipe(
      makeRecipe({
        id: 'r1',
        chatHistory: [{ role: 'user', content: 'private prompt', timestamp: 1 }],
      })
    );

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('chatHistory');
  });

  it('writes the local collaborators on create', async () => {
    const collaborators = [{ uid: 'c1', displayName: 'C1' }];
    await publishRecipe(makeRecipe({ id: 'r1', collaborators }));

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload.collaborators).toEqual(collaborators);
  });

  it('keeps createdBy and createdAt on create', async () => {
    const createdBy = { uid: 'u1', displayName: 'U' };
    await publishRecipe(makeRecipe({ id: 'r1', createdBy, createdAt: 1234 }));

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload.createdBy).toEqual(createdBy);
    expect(payload.createdAt).toBe(1234);
  });

  it('defaults collaborators to [] on create when the local copy has none', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', collaborators: undefined }));

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload.collaborators).toEqual([]);
  });
});

describe('publishRecipe: existence check fails', () => {
  // Same as before RL-037: the getDoc rejection surfaces to the caller and
  // nothing is written, so a caller never guesses create or update.
  it('rejects with the read error and writes nothing', async () => {
    getDocError = new Error('unavailable');

    await expect(publishRecipe(makeRecipe({ id: 'r1' }))).rejects.toThrow('unavailable');
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('publishRecipe — re-publish', () => {
  beforeEach(() => {
    docExists = true;
  });

  // The FUN-10 defect: setDoc wrote favoriteCount/viewCount 0 unconditionally,
  // wiping other users' favourites and every view on any re-publish.
  it('does not reset favoriteCount or viewCount', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' } }));

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('favoriteCount');
    expect(payload).not.toHaveProperty('viewCount');
  });

  it('merges rather than overwriting the existing doc', async () => {
    await publishRecipe(makeRecipe({ id: 'r1' }));

    expect(setDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('does not inflate the profile recipeCount on a retry', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' } }));

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('still updates the recipe content', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', title: 'Renamed Dish' }));

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload.title).toBe('Renamed Dish');
  });

  // RL-037: a merge replaces arrays wholesale, so the local (possibly stale)
  // collaborators would erase credit the approval arrayUnion wrote in the cloud.
  it('does not write collaborators, even when the local copy has some', async () => {
    await publishRecipe(
      makeRecipe({ id: 'r1', collaborators: [{ uid: 'c1', displayName: 'C1' }] })
    );

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('collaborators');
  });

  it.each([undefined, null])(
    'does not write collaborators when the local value is %s',
    async (value) => {
      await publishRecipe(
        makeRecipe({ id: 'r1', collaborators: value as unknown as [] })
      );

      const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
      expect(Object.keys(payload)).not.toContain('collaborators');
    }
  );

  it('does not write collaborators when the local copy has none', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', collaborators: [] }));

    const payload = setDoc.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('collaborators');
  });

  it('rejects with the write error, as before', async () => {
    setDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(publishRecipe(makeRecipe({ id: 'r1' }))).rejects.toThrow('permission-denied');
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
