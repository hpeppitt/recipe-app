// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '../db/database';
import { makeRecipe } from '../test/factories';

const getUserRecipes = vi.fn();
vi.mock('../services/firestore', () => ({
  getUserRecipes: (...a: unknown[]) => getUserRecipes(...a),
  getRecipesByUsers: vi.fn(),
}));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { useOwnRecipes } from './useUserRecipes';

beforeEach(async () => {
  vi.clearAllMocks();
  await db.recipes.clear();
});

describe('useOwnRecipes', () => {
  it('uses one getUserRecipes call for several local recipes; unpublished ones count zero', async () => {
    const mine = { uid: 'me', displayName: null };
    for (const id of ['p1', 'p2', 'draft']) await db.recipes.add(makeRecipe({ id, createdBy: mine }));
    // p3 is published but not held locally: it must not leak into the totals.
    getUserRecipes.mockResolvedValue([
      { id: 'p1', viewCount: 10, favoriteCount: 2 },
      { id: 'p2', viewCount: 5 },
      { id: 'p3', viewCount: 99, favoriteCount: 99 },
    ]);
    const { result } = renderHook(() => useOwnRecipes('me'));
    await waitFor(() => expect(result.current.stats.totalViews).toBe(15));
    const byId = Object.fromEntries(result.current.recipes.map((r) => [r.id, [r.viewCount, r.favoriteCount]]));
    expect(byId).toEqual({ p1: [10, 2], p2: [5, 0], draft: [0, 0] });
    expect(result.current.stats).toEqual({ totalViews: 15, totalFavorites: 2 });
    expect(getUserRecipes).toHaveBeenCalledTimes(1);
    expect(getUserRecipes).toHaveBeenCalledWith('me');
  });
});
