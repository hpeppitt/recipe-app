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

const { getRecipesByUsers } = await import('./firestore');

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
