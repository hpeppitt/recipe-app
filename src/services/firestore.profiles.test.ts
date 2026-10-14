import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDoc = vi.fn();
vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: (ref: unknown) => getDoc(ref),
}));

const { getFollowingProfiles } = await import('./firestore');

type Ref = { id: string };
const found = (id: string) => ({ exists: () => true, id, data: () => ({ displayName: id }) });
const missing = { exists: () => false };

describe('getFollowingProfiles', () => {
  beforeEach(() => {
    getDoc.mockReset();
  });

  it('issues every read before any resolves and keeps input order', async () => {
    const resolvers: Record<string, (v: unknown) => void> = {};
    getDoc.mockImplementation((ref: Ref) => new Promise((r) => (resolvers[ref.id] = r)));
    const out = getFollowingProfiles(['a', 'b', 'c']);
    expect(getDoc).toHaveBeenCalledTimes(3); // all in flight, none awaited yet
    resolvers.c(found('c'));
    resolvers.a(found('a'));
    resolvers.b(found('b'));
    expect((await out).map((p) => p.uid)).toEqual(['a', 'b', 'c']);
  });

  it('skips a missing profile and keeps the rest in order', async () => {
    getDoc.mockImplementation(async (ref: Ref) => (ref.id === 'b' ? missing : found(ref.id)));
    expect((await getFollowingProfiles(['a', 'b', 'c'])).map((p) => p.uid)).toEqual(['a', 'c']);
  });

  it('rejects when a read fails, as the sequential loop did', async () => {
    getDoc.mockImplementation(async (ref: Ref) => {
      if (ref.id === 'b') throw new Error('denied');
      return found(ref.id);
    });
    await expect(getFollowingProfiles(['a', 'b'])).rejects.toThrow('denied');
  });

  it('makes no reads for no ids', async () => {
    expect(await getFollowingProfiles([])).toEqual([]);
    expect(getDoc).not.toHaveBeenCalled();
  });
});
