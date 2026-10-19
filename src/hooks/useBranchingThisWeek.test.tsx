// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeRecipe } from '../test/factories';

const getRecent = vi.fn();
const getOne = vi.fn();
vi.mock('../services/firestore', () => ({
  getRecentPublishedRecipes: (...a: unknown[]) => getRecent(...a),
  getPublishedRecipe: (...a: unknown[]) => getOne(...a),
}));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
let timeoutNow = false;
vi.mock('../lib/utils', async (orig) => {
  const mod = await orig<typeof import('../lib/utils')>();
  return { ...mod, withTimeout: <T,>(p: Promise<T>, ms: number, fb: T) => mod.withTimeout(p, timeoutNow ? 30 : ms, fb) };
});

import { useBranchingThisWeek, clearBranchingThisWeekCache } from './useBranchingThisWeek';
import { buildFeed } from '../lib/library';

const now = Date.now();
const root = (id: string) => ({ ...makeRecipe({ id, title: id }), favoriteCount: 0, viewCount: 0 });
const kid = (id: string, rootId: string) => ({ ...makeRecipe({ id, rootId, parentId: rootId, depth: 1, createdAt: now - 1000 }), favoriteCount: 0, viewCount: 0 });
const feed = (...ids: string[]) => buildFeed(ids.map(root), []);

beforeEach(() => {
  getRecent.mockReset();
  getOne.mockReset();
  reportError.mockReset();
  timeoutNow = false;
  clearBranchingThisWeekCache();
});

describe('useBranchingThisWeek', () => {
  it('runs the query once across remounts and reads nothing for known roots', async () => {
    getRecent.mockResolvedValue([kid('k1', 'a'), kid('k2', 'a')]);
    const loaded = feed('a');
    const first = renderHook(() => useBranchingThisWeek(true, loaded));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    first.unmount();
    const second = renderHook(() => useBranchingThisWeek(true, loaded));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(second.result.current.tiles[0]).toMatchObject({ id: 'a', weekCount: 2 });
    expect(getRecent).toHaveBeenCalledTimes(1);
    expect(getOne).not.toHaveBeenCalled();
  });

  it('uses a root found in the query result, and fetches unknown roots once each', async () => {
    getRecent.mockResolvedValue([root('q'), kid('k1', 'q'), kid('k2', 'z')]);
    getOne.mockResolvedValue(root('z'));
    const a = renderHook(() => useBranchingThisWeek(true, []));
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    a.unmount();
    const b = renderHook(() => useBranchingThisWeek(true, []));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(b.result.current.tiles.map((t) => t.id).sort()).toEqual(['q', 'z']);
    expect(getOne).toHaveBeenCalledTimes(1);
    expect(getOne).toHaveBeenCalledWith('z');
  });

  it('drops a family whose root was deleted', async () => {
    getRecent.mockResolvedValue([kid('k1', 'gone'), kid('k2', 'a')]);
    getOne.mockResolvedValue(null);
    const { result } = renderHook(() => useBranchingThisWeek(true, feed('a')));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tiles.map((t) => t.id)).toEqual(['a']);
  });

  it('gives none for a rejection (reported), a timeout and an empty week', async () => {
    getRecent.mockRejectedValue(new Error('boom'));
    const a = renderHook(() => useBranchingThisWeek(true, []));
    await waitFor(() => expect(a.result.current.status).toBe('none'));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'branching-week');

    clearBranchingThisWeekCache();
    timeoutNow = true;
    getRecent.mockReturnValue(new Promise(() => {}));
    const b = renderHook(() => useBranchingThisWeek(true, []));
    await waitFor(() => expect(b.result.current.status).toBe('none'));
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'branching-week timeout' }), 'branching-week');

    clearBranchingThisWeekCache();
    getRecent.mockResolvedValue([]);
    const c = renderHook(() => useBranchingThisWeek(true, []));
    await waitFor(() => expect(c.result.current.status).toBe('none'));
  });

  it('makes no call when disabled', () => {
    const { result } = renderHook(() => useBranchingThisWeek(false, []));
    expect(result.current.status).toBe('none');
    expect(getRecent).not.toHaveBeenCalled();
  });
});
