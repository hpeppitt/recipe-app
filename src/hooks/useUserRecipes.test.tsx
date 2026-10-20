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

import { useUserRecipes, useFollowingRecipes, useOwnRecipes } from './useUserRecipes';
import { db } from '../db/database';
import { makeRecipe } from '../test/factories';

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

describe('useOwnRecipes statsStatus', () => {
  beforeEach(() => db.recipes.clear());

  it('is ready with zeros for an empty library', async () => {
    const { result } = renderHook(() => useOwnRecipes('me'));
    await waitFor(() => expect(result.current.statsStatus).toBe('ready'));
    expect(getUserRecipes).not.toHaveBeenCalled();
  });

  it('is loading, then error and reported when the read fails', async () => {
    await db.recipes.add(makeRecipe({ id: 'r1', createdBy: { uid: 'me', displayName: null } }));
    getUserRecipes.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useOwnRecipes('me'));
    expect(result.current.statsStatus).toBe('loading');
    await waitFor(() => expect(result.current.statsStatus).toBe('error'));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'load-own-stats');
  });

  it('is ready with the summed saves on success', async () => {
    await db.recipes.add(makeRecipe({ id: 'r1', createdBy: { uid: 'me', displayName: null } }));
    getUserRecipes.mockResolvedValue([recipe('r1')]);
    const { result } = renderHook(() => useOwnRecipes('me'));
    await waitFor(() => expect(result.current.statsStatus).toBe('ready'));
    expect(result.current.stats.totalFavorites).toBe(2);
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
