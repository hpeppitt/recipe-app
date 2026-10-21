// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, TermsContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { COLLECTION_RECIPE_CAP, COLLECTIONS_PER_USER_MAX, CollectionRefusedError } from '../lib/kitchen';
import type { AppUser } from '../types/recipe';
import { RateLimitedError } from '../lib/errors';
import type { RecipeCollection } from '../services/firestore';

const subscribeCollections = vi.fn();
const createCollection = vi.fn();
const renameCollection = vi.fn();
const deleteCollection = vi.fn();
const addToCollection = vi.fn();
const removeFromCollection = vi.fn();
const setCookbookSharing = vi.fn();
const unsubscribe = vi.fn();
vi.mock('../services/firestore', () => ({
  subscribeCollections: (...a: unknown[]) => subscribeCollections(...a),
  createCollection: (...a: unknown[]) => createCollection(...a),
  renameCollection: (...a: unknown[]) => renameCollection(...a),
  deleteCollection: (...a: unknown[]) => deleteCollection(...a),
  addToCollection: (...a: unknown[]) => addToCollection(...a),
  removeFromCollection: (...a: unknown[]) => removeFromCollection(...a),
  setCookbookSharing: (...a: unknown[]) => setCookbookSharing(...a),
}));
const getIdToken = vi.fn(async () => 'token');
vi.mock('../services/firebase', () => ({ auth: { currentUser: { getIdToken: (...a: unknown[]) => getIdToken(...(a as [])) } } }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import {
  COLLECTIONS_FAILED_MESSAGE,
  COLLECTIONS_LOAD_FAILED_MESSAGE,
  COLLECTIONS_MAYBE_SAVED_MESSAGE,
  COLLECTIONS_RETRY_MS,
  useCollections,
} from './useCollections';

const wrapperFor = (user: AppUser | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={{ user, isLoading: false, isConfigured: true } as AuthContextType}>
        {children}
      </AuthContext.Provider>
    );
  };

const col = (id: string, recipeIds: string[] = []): RecipeCollection => ({
  id,
  ownerUid: fakeUser.uid,
  name: id,
  recipeIds,
  visibility: 'private',
  description: null,
  createdAt: 1,
  updatedAt: 1,
});

let initial: RecipeCollection[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  initial = [col('c1', ['r1'])];
  subscribeCollections.mockImplementation((_uid: string, next: (c: RecipeCollection[]) => void) => {
    next(initial);
    return unsubscribe;
  });
  for (const fn of [renameCollection, deleteCollection, addToCollection, removeFromCollection]) fn.mockResolvedValue(undefined);
  createCollection.mockResolvedValue('new-id');
});
afterEach(() => vi.spyOn(navigator, 'onLine', 'get').mockRestore());

describe('useCollections', () => {
  it('opens one listener for the uid however many components call it, and closes it after the last', () => {
    const wrapper = wrapperFor(fakeUser);
    const a = renderHook(() => useCollections(), { wrapper });
    const b = renderHook(() => useCollections(), { wrapper });
    expect(subscribeCollections).toHaveBeenCalledTimes(1);
    expect(subscribeCollections).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function), expect.any(Function));
    expect(b.result.current.collections).toEqual(initial);
    expect(b.result.current.loading).toBe(false);
    a.unmount();
    expect(unsubscribe).not.toHaveBeenCalled();
    b.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['signed out', null],
    ['unverified', { ...fakeUser, emailVerified: false }],
    ['anonymous', { ...fakeUser, isAnonymous: true }],
  ])('returns an empty list without reading when %s', async (_label, user) => {
    const { result } = renderHook(() => useCollections(), { wrapper: wrapperFor(user) });
    expect(subscribeCollections).not.toHaveBeenCalled();
    expect(result.current.collections).toEqual([]);
    expect(result.current.loading).toBe(false);
    await expect(result.current.createCollection('Soups')).rejects.toThrow('verified');
    expect(createCollection).not.toHaveBeenCalled();
  });

  it('passes each action to the service', async () => {
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await expect(result.current.createCollection('Soups', 'r2')).resolves.toBe('new-id');
    expect(createCollection).toHaveBeenCalledWith('Soups', 'r2');
    await act(() => result.current.renameCollection('c1', 'Pasta'));
    expect(renameCollection).toHaveBeenCalledWith('c1', 'Pasta');
    await act(() => result.current.addToCollection('c1', 'r2'));
    expect(addToCollection).toHaveBeenCalledWith('c1', 'r2');
    await act(() => result.current.removeFromCollection('c1', 'r1'));
    expect(removeFromCollection).toHaveBeenCalledWith('c1', 'r1');
    await act(() => result.current.deleteCollection('c1'));
    expect(deleteCollection).toHaveBeenCalledWith('c1');
    unmount();
  });

  it.each([
    [false, false],
    [true, true],
  ])('on a public collection, ensureCurrent=%s means a write: %s', async (current, writes) => {
    initial = [{ ...col('c1', ['r1']), visibility: 'public' }];
    const ensureCurrent = vi.fn(async () => current);
    const inner = wrapperFor(fakeUser);
    const wrapper = ({ children }: { children: ReactNode }) => {
      const Auth = inner;
      return (
        <Auth>
          <TermsContext.Provider value={{ pending: false, accept: async () => {}, decline: async () => {}, ensureCurrent }}>{children}</TermsContext.Provider>
        </Auth>
      );
    };
    const { result, unmount } = renderHook(() => useCollections(), { wrapper });
    const done = result.current.addToCollection('c1', 'r2');
    if (writes) await act(() => done);
    else await expect(done).rejects.toThrow('Accept the Terms, then try again.');
    expect(ensureCurrent).toHaveBeenCalled();
    expect(addToCollection).toHaveBeenCalledTimes(writes ? 1 : 0);
    unmount();
  });

  it('refuses a bad name with its copy before writing, without setting error', async () => {
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await expect(result.current.createCollection('   ')).rejects.toThrow('Give it a name.');
    await expect(result.current.renameCollection('c1', 'x'.repeat(61))).rejects.toThrow('Keep it under 60 characters.');
    expect(createCollection).not.toHaveBeenCalled();
    expect(renameCollection).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('refuses the 201st recipe from the listener list before writing, and a recipe id over 36 characters', async () => {
    initial = [col('full', Array.from({ length: COLLECTION_RECIPE_CAP }, (_, i) => `r${i}`))];
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await expect(result.current.addToCollection('full', 'new')).rejects.toThrow('This collection is full.');
    await expect(result.current.addToCollection('full', 'x'.repeat(37))).rejects.toBeInstanceOf(CollectionRefusedError);
    expect(addToCollection).not.toHaveBeenCalled();
    // Already in the full collection: no refusal, the service no-ops.
    await act(() => result.current.addToCollection('full', 'r0'));
    expect(addToCollection).toHaveBeenCalledWith('full', 'r0');
    unmount();
  });

  it('passes on the service refusing a full collection the listener had not seen yet', async () => {
    addToCollection.mockRejectedValueOnce(new CollectionRefusedError('This collection is full.'));
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await expect(result.current.addToCollection('c1', 'r2')).rejects.toThrow('This collection is full.');
    expect(reportError).not.toHaveBeenCalled();
    unmount();
  });

  it('maps the cookbook publish cap to its own copy without setting the page error (RL-265)', async () => {
    setCookbookSharing.mockRejectedValueOnce(new RateLimitedError('cookbook'));
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    const err = await result.current.setCookbookSharing('c1', 'public', 'Warm').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CollectionRefusedError);
    expect((err as Error).message).toBe("You've shared a lot of cookbooks today. Try again tomorrow.");
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('maps a timeout to may-have-saved and other failures to the generic copy, setting error', async () => {
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    createCollection.mockRejectedValueOnce(new Error('Creating the collection timed out'));
    await act(() => expect(result.current.createCollection('Soups')).rejects.toThrow(COLLECTIONS_MAYBE_SAVED_MESSAGE));
    expect(result.current.error).toBe(COLLECTIONS_MAYBE_SAVED_MESSAGE);
    deleteCollection.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await act(() => expect(result.current.deleteCollection('c1')).rejects.toThrow(COLLECTIONS_FAILED_MESSAGE));
    expect(reportError).toHaveBeenCalledTimes(2);
    await act(() => result.current.renameCollection('c1', 'Pasta'));
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('refuses offline without calling the service', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.removeFromCollection('c1', 'r1')).rejects.toThrow(COLLECTIONS_FAILED_MESSAGE));
    expect(removeFromCollection).not.toHaveBeenCalled();
    unmount();
  });

  it('reports a listener error, shows the load copy, and retries once after refreshing the token', async () => {
    vi.useFakeTimers();
    subscribeCollections.mockImplementationOnce((_uid: string, _next: unknown, onError: (e: Error) => void) => {
      onError(Object.assign(new Error('denied'), { code: 'permission-denied' }));
      return unsubscribe;
    });
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    expect(result.current.error).toBe(COLLECTIONS_LOAD_FAILED_MESSAGE);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'collections-listener');
    await act(() => vi.advanceTimersByTimeAsync(COLLECTIONS_RETRY_MS));
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(subscribeCollections).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.collections).toEqual(initial);
    unmount();
    vi.useRealTimers();
  });

  it('retry() resubscribes after a listener error and clears the error', async () => {
    subscribeCollections.mockImplementationOnce((_uid: string, _next: unknown, onError: (e: Error) => void) => {
      onError(new Error('unavailable'));
      return unsubscribe;
    });
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    expect(result.current.error).toBe(COLLECTIONS_LOAD_FAILED_MESSAGE);
    act(() => result.current.retry());
    expect(subscribeCollections).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.collections).toEqual(initial);
    // With a live listener it does nothing.
    act(() => result.current.retry());
    expect(subscribeCollections).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('resets the retry after a good snapshot, so a later failure retries again', async () => {
    vi.useFakeTimers();
    const fail = (_uid: string, _next: unknown, onError: (e: Error) => void) => {
      onError(new Error('unavailable'));
      return unsubscribe;
    };
    subscribeCollections.mockImplementationOnce(fail);
    const { unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await act(() => vi.advanceTimersByTimeAsync(COLLECTIONS_RETRY_MS));
    expect(subscribeCollections).toHaveBeenCalledTimes(2);
    // The second listener delivered a snapshot; now it fails, and the hook retries once more.
    const onError = subscribeCollections.mock.calls[1][2] as (e: Error) => void;
    act(() => onError(new Error('unavailable')));
    await act(() => vi.advanceTimersByTimeAsync(COLLECTIONS_RETRY_MS));
    expect(subscribeCollections).toHaveBeenCalledTimes(3);
    unmount();
    vi.useRealTimers();
  });

  it('treats deleting a collection the listener no longer has as done, without writing', async () => {
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await act(() => result.current.deleteCollection('gone'));
    expect(deleteCollection).not.toHaveBeenCalled();
    unmount();
  });

  it('refuses rename, add and remove on a collection that is gone', async () => {
    const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });
    renameCollection.mockRejectedValueOnce(denied());
    removeFromCollection.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'not-found' }));
    addToCollection.mockRejectedValueOnce(new CollectionRefusedError('That collection no longer exists.'));
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await expect(result.current.renameCollection('gone', 'Pasta')).rejects.toThrow('That collection no longer exists.');
    await expect(result.current.removeFromCollection('gone', 'r1')).rejects.toThrow('That collection no longer exists.');
    await expect(result.current.addToCollection('gone', 'r1')).rejects.toBeInstanceOf(CollectionRefusedError);
    expect(result.current.error).toBeNull();
    // A denial on a collection the listener still has is a real failure.
    renameCollection.mockRejectedValueOnce(denied());
    await act(() => expect(result.current.renameCollection('c1', 'Pasta')).rejects.toThrow(COLLECTIONS_FAILED_MESSAGE));
    unmount();
  });

  it('skips removing a recipe the collection does not hold', async () => {
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await act(() => result.current.removeFromCollection('c1', 'not-there'));
    expect(removeFromCollection).not.toHaveBeenCalled();
    unmount();
  });

  it('refuses a 101st collection before writing', async () => {
    initial = Array.from({ length: COLLECTIONS_PER_USER_MAX }, (_, i) => col(`c${i}`));
    const { result, unmount } = renderHook(() => useCollections(), { wrapper: wrapperFor(fakeUser) });
    await expect(result.current.createCollection('One more')).rejects.toThrow('You have 100 collections. Delete one first.');
    expect(createCollection).not.toHaveBeenCalled();
    unmount();
  });
});
