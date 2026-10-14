import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked at the SDK boundary like the other firestore tests: pins the query shape and merge.
const getDocs = vi.fn();

vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDocs: (...args: unknown[]) => getDocs(...args),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => ['where', ...args],
  orderBy: (...args: unknown[]) => ['orderBy', ...args],
  limit: (...args: unknown[]) => ['limit', ...args],
}));

const { getRecipesByUsers, isFollowing, isCloudFavorite } = await import('./firestore');

const snap = (...createdAt: number[]) => ({ docs: createdAt.map((c) => ({ id: `r${c}`, data: () => ({ createdAt: c }) })) });

describe('getRecipesByUsers', () => {
  beforeEach(() => getDocs.mockReset());

  it('queries newest-first with limit 50 and merges chunks newest first', async () => {
    getDocs.mockResolvedValueOnce(snap(5, 1)).mockResolvedValueOnce(snap(9, 3));
    const uids = Array.from({ length: 31 }, (_, i) => `u${i}`);
    const out = await getRecipesByUsers(uids);
    expect(getDocs).toHaveBeenCalledTimes(2);
    const q = getDocs.mock.calls[0][0] as unknown[];
    expect(q).toContainEqual(['orderBy', 'createdAt', 'desc']);
    expect(q).toContainEqual(['limit', 50]);
    expect(q.indexOf(q.find((x) => (x as unknown[])[0] === 'orderBy')!)).toBeLessThan(q.indexOf(q.find((x) => (x as unknown[])[0] === 'limit')!));
    expect(out.map((r) => r.createdAt)).toEqual([9, 5, 3, 1]);
  });
});

describe('isFollowing and isCloudFavorite', () => {
  beforeEach(() => getDocs.mockReset());

  // The rules read resource.data, so a getDoc of a missing doc is denied; a query
  // with provable equality filters returns empty instead (emulator-verified, RL-026).
  it('query with both equality filters and limit 1, empty means false', async () => {
    getDocs.mockResolvedValue({ empty: true });
    expect(await isFollowing('me', 'you')).toBe(false);
    const q = getDocs.mock.calls[0][0] as unknown[];
    expect(q).toContainEqual(['where', 'followerId', '==', 'me']);
    expect(q).toContainEqual(['where', 'followingId', '==', 'you']);
    expect(q).toContainEqual(['limit', 1]);
  });

  it('a non-empty result is true', async () => {
    getDocs.mockResolvedValue({ empty: false });
    expect(await isCloudFavorite('me', 'r1')).toBe(true);
    const q = getDocs.mock.calls[0][0] as unknown[];
    expect(q).toContainEqual(['where', 'uid', '==', 'me']);
    expect(q).toContainEqual(['where', 'recipeId', '==', 'r1']);
  });
});
