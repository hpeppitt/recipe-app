import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mocked at the SDK boundary, like firestore.favorites.test.ts. Pins the RL-017
 * ordering: on approve the collaborator write comes first, and if it fails the
 * suggestion status is never written and the suggester is never notified.
 */

const updateDoc = vi.fn(async (..._args: unknown[]) => {});
const addDoc = vi.fn(async (..._args: unknown[]) => {});
const reportError = vi.fn();
const onSnapshot = vi.fn((..._args: unknown[]) => () => {});

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  isFirebaseConfigured: true,
}));

vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({
      recipeId: 'recipe-1',
      recipeOwnerId: 'owner',
      recipeTitle: 'Soup',
      recipeEmoji: '🍲',
      message: 'More salt',
      status: 'pending',
      suggestedBy: { uid: 'suggester', displayName: 'Sam' },
    }),
  })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  setDoc: vi.fn(async () => {}),
  addDoc: (...args: unknown[]) => addDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
  deleteDoc: vi.fn(async () => {}),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) }),
  arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
}));

const { updateSuggestionStatus, subscribeRecipeSuggestions } = await import('./firestore');
const reviewer = { uid: 'owner', displayName: 'Olive' };
const collaborator = { uid: 'suggester', displayName: 'Sam' };

beforeEach(() => {
  updateDoc.mockReset();
  updateDoc.mockImplementation(async () => {});
  addDoc.mockClear();
  reportError.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('updateSuggestionStatus', () => {
  it('approves in order: collaborator, then status, then notification', async () => {
    const result = await updateSuggestionStatus('s1', 'approved', reviewer);

    expect(updateDoc.mock.calls).toEqual([
      [{ path: 'recipes/recipe-1' }, { collaborators: { __arrayUnion: [collaborator] } }],
      [{ path: 'suggestions/s1' }, { status: 'approved' }],
    ]);
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1]).toMatchObject({ type: 'suggestion_approved', recipientUid: 'suggester' });
    expect(result).toEqual({ recipeId: 'recipe-1', collaborator });
  });

  it('throws without writing status or notifying when the collaborator write is rejected', async () => {
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(updateSuggestionStatus('s1', 'approved', reviewer)).rejects.toThrow('permission-denied');

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalledWith({ path: 'suggestions/s1' }, expect.anything());
    expect(addDoc).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'add-collaborator');
  });

  it('rejects with a status write and a notification only', async () => {
    const result = await updateSuggestionStatus('s1', 'rejected', reviewer);

    expect(updateDoc.mock.calls).toEqual([[{ path: 'suggestions/s1' }, { status: 'rejected' }]]);
    expect(addDoc.mock.calls[0][1]).toMatchObject({ type: 'suggestion_rejected' });
    expect(result).toBeNull();
  });
});

describe('subscribeRecipeSuggestions', () => {
  // The read rule is two-party and a list is authorised from its filters, so
  // each query must filter on the field the rule checks against the viewer.
  const queryOf = () => onSnapshot.mock.calls.at(-1)?.[0];

  it('owner query filters on recipeOwnerId', () => {
    subscribeRecipeSuggestions('recipe-1', 'owner', true, () => {});
    expect(queryOf()).toEqual([
      { path: 'suggestions' },
      ['recipeId', '==', 'recipe-1'],
      ['recipeOwnerId', '==', 'owner'],
      ['createdAt', 'desc'],
    ]);
  });

  it('anyone else filters on suggestedBy.uid', () => {
    subscribeRecipeSuggestions('recipe-1', 'suggester', false, () => {});
    expect(queryOf()).toEqual([
      { path: 'suggestions' },
      ['recipeId', '==', 'recipe-1'],
      ['suggestedBy.uid', '==', 'suggester'],
      ['createdAt', 'desc'],
    ]);
  });
});
