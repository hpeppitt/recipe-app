// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getPage = vi.fn();
vi.mock('../services/firestore', () => ({
  getPublishedRecipesPage: (...a: unknown[]) => getPage(...a),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../db/recipes', () => ({ getAllRecipes: vi.fn(async () => []) }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { useCloudLibrary } from './useRecipeLibrary';

type Page = { recipes: { id: string }[]; cursor: unknown; hasMore: boolean };
const page = (id: string, hasMore = false): Page => ({ recipes: [{ id }], cursor: { id }, hasMore });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const ids = (r: { recipes: { id: string }[] | null }) => r.recipes?.map((x) => x.id);
beforeEach(() => vi.clearAllMocks());

describe('useCloudLibrary stale responses', () => {
  it('keeps the newer result when an older first load resolves after a retry', async () => {
    const slow = deferred<Page>();
    getPage.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page('new'));
    const { result } = renderHook(() => useCloudLibrary(true));
    act(() => result.current.retryCloud());
    await waitFor(() => expect(ids(result.current)).toEqual(['new']));
    await act(async () => slow.resolve(page('old')));
    expect(ids(result.current)).toEqual(['new']);
  });

  it('does not append a loadMore page that resolves after a reload', async () => {
    getPage.mockResolvedValueOnce(page('a', true));
    const { result } = renderHook(() => useCloudLibrary(true));
    await waitFor(() => expect(ids(result.current)).toEqual(['a']));
    const slow = deferred<Page>();
    getPage.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page('b'));
    act(() => void result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    act(() => result.current.retryCloud());
    await waitFor(() => expect(ids(result.current)).toEqual(['b']));
    expect(result.current.loadingMore).toBe(false);
    await act(async () => slow.resolve(page('stale')));
    expect(ids(result.current)).toEqual(['b']);
    expect(result.current.loadingMore).toBe(false);
  });

  it('ignores a loadMore rejection that arrives after a reload', async () => {
    getPage.mockResolvedValueOnce(page('a', true));
    const { result } = renderHook(() => useCloudLibrary(true));
    await waitFor(() => expect(ids(result.current)).toEqual(['a']));
    const slow = deferred<Page>();
    getPage.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page('b'));
    act(() => void result.current.loadMore());
    act(() => result.current.retryCloud());
    await waitFor(() => expect(ids(result.current)).toEqual(['b']));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => slow.reject(new Error('late')));
    expect(result.current.loadMoreError).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
