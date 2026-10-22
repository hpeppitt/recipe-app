import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDoc = vi.fn();
const setDoc = vi.fn(async (..._a: unknown[]) => {});
const updateDoc = vi.fn(async (..._a: unknown[]) => {});
vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: (ref: unknown) => getDoc(ref),
  setDoc: (...a: unknown[]) => setDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
}));

const { getFollowingProfiles, createOrUpdateProfile } = await import('./firestore');

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

describe('createOrUpdateProfile defaultCountry (RL-282)', () => {
  const existing = (data: Record<string, unknown>) => ({ exists: () => true, id: 'me', data: () => data });

  beforeEach(() => {
    getDoc.mockReset();
    setDoc.mockClear();
    updateDoc.mockClear();
  });

  it('gives a new profile the default country', async () => {
    getDoc.mockResolvedValue(missing);
    await createOrUpdateProfile('me', { displayName: 'Cook' }, { defaultCountry: 'GB' });
    expect(setDoc.mock.calls[0][1]).toMatchObject({ displayName: 'Cook', country: 'GB' });
  });

  it('fills an existing profile that has no country key', async () => {
    getDoc.mockResolvedValue(existing({ displayName: 'Cook' }));
    await createOrUpdateProfile('me', { displayName: 'Cook' }, { defaultCountry: 'GB' });
    expect(updateDoc.mock.calls[0][1]).toEqual({ displayName: 'Cook', country: 'GB' });
  });

  it.each([null, 'FR'])('never changes an existing country of %s', async (country) => {
    getDoc.mockResolvedValue(existing({ displayName: 'Cook', country }));
    await createOrUpdateProfile('me', { displayName: 'Cook' }, { defaultCountry: 'GB' });
    expect(updateDoc.mock.calls[0][1]).toEqual({ displayName: 'Cook' });
  });

  it('writes null for a zone that maps to nothing, so it is not retried', async () => {
    getDoc.mockResolvedValue(existing({ displayName: 'Cook' }));
    await createOrUpdateProfile('me', { displayName: 'Cook' }, { defaultCountry: null });
    expect(updateDoc.mock.calls[0][1]).toEqual({ displayName: 'Cook', country: null });
  });

  it('adds no country without the option', async () => {
    getDoc.mockResolvedValue(existing({ displayName: 'Cook' }));
    await createOrUpdateProfile('me', { bio: 'hi' });
    expect(updateDoc.mock.calls[0][1]).toEqual({ bio: 'hi' });
  });
});
