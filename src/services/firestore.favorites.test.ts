import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  // Record the target path so assertions can tell favourites from recipes.
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: vi.fn(async () => ({ docs: [] })),
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
  writeBatch: () => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  }),
  arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
}));

const { removeCloudFavorite } = await import('./firestore');

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
