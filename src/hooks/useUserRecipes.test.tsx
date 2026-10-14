// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getUserRecipes = vi.fn();
const getRecipesByUsers = vi.fn();
vi.mock('../services/firestore', () => ({
  getUserRecipes: (...a: unknown[]) => getUserRecipes(...a),
  getRecipesByUsers: (...a: unknown[]) => getRecipesByUsers(...a),
  getRecipeStats: vi.fn(async () => new Map()),
}));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useUserRecipes, useFollowingRecipes } from './useUserRecipes';

const recipe = (id: string) => ({ id, viewCount: 1, favoriteCount: 2 });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
beforeEach(() => vi.clearAllMocks());

describe('useUserRecipes', () => {
  it('never shows profile A late response under profile B', async () => {
    const a = deferred<unknown[]>();
    getUserRecipes.mockImplementation((u: string) => (u === 'A' ? a.promise : Promise.resolve([recipe('b1')])));
    const { result, rerender } = renderHook(({ uid }) => useUserRecipes(uid), { initialProps: { uid: 'A' } });
    rerender({ uid: 'B' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => a.resolve([recipe('a1')]));
    expect(result.current.recipes.map((r) => r.id)).toEqual(['b1']);
    expect(result.current.stats).toEqual({ totalViews: 1, totalFavorites: 2 });
  });

  it('settles loading and reports on failure', async () => {
    getUserRecipes.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useUserRecipes('A'));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'load-user-recipes');
  });
});

describe('useFollowingRecipes', () => {
  it('is loading on the first render with ids, then settles', async () => {
    getRecipesByUsers.mockResolvedValue([recipe('r1')]);
    const { result } = renderHook(() => useFollowingRecipes(['u1']));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recipes).toHaveLength(1);
  });

  it('settles loading and reports on failure', async () => {
    getRecipesByUsers.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useFollowingRecipes(['u1']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'load-following-recipes');
  });

  it('ignores a late response after the ids change', async () => {
    const a = deferred<unknown[]>();
    getRecipesByUsers.mockImplementation((ids: string[]) => (ids[0] === 'a' ? a.promise : Promise.resolve([recipe('b1')])));
    const { result, rerender } = renderHook(({ ids }) => useFollowingRecipes(ids), { initialProps: { ids: ['a'] } });
    rerender({ ids: ['b'] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => a.resolve([recipe('a1')]));
    expect(result.current.recipes.map((r) => r.id)).toEqual(['b1']);
  });
});
