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

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async () => ({ exists: () => docExists })),
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
}));

const { publishRecipe } = await import('./firestore');

beforeEach(() => {
  setDoc.mockClear();
  updateDoc.mockClear();
  docExists = false;
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

  it('bumps the creator profile recipeCount', async () => {
    await publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' } }));

    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'profiles/u1' },
      { recipeCount: { __increment: 1 } }
    );
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
});
