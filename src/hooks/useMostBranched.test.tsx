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
const firebase = vi.hoisted(() => ({ isFirebaseConfigured: true }));
vi.mock('../services/firebase', () => firebase);
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useMostBranched } from './useMostBranched';
import { clearRecentPublishedCache } from './recentPublished';

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const pub = (o: Parameters<typeof makeRecipe>[0]) => ({ ...makeRecipe(o), favoriteCount: 0, viewCount: 0 });
const root = (id: string) => pub({ id, title: id });
const kid = (id: string, rootId: string, daysAgo: number) =>
  pub({ id, rootId, parentId: rootId, depth: 1, createdAt: now - daysAgo * DAY });

beforeEach(() => {
  getRecent.mockReset();
  getOne.mockReset();
  reportError.mockReset();
  firebase.isFirebaseConfigured = true;
  clearRecentPublishedCache();
});

describe('useMostBranched', () => {
  it('reads once, re-ranks per range, shows loading on change, fetches a missing root once', async () => {
    getRecent.mockResolvedValue([root('a'), kid('k1', 'a', 1), kid('k2', 'a', 60), kid('k3', 'z', 40), kid('k4', 'z', 50), kid('k5', 'z', 70)]);
    getOne.mockResolvedValue(root('z'));
    const { result, rerender } = renderHook(({ r }) => useMostBranched(r), { initialProps: { r: '90' as '30' | '90' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tiles.map((t) => [t.id, t.count])).toEqual([['z', 3], ['a', 2]]);
    expect(result.current.allTimeAvailable).toBe(false);
    expect(result.current.capped).toBe(false);
    rerender({ r: '30' });
    expect(result.current.status).toBe('loading');
    expect(result.current.tiles).toEqual([]);
    await waitFor(() => expect(result.current.tiles.map((t) => t.id)).toEqual(['a']));
    expect(getRecent).toHaveBeenCalledTimes(1);
    expect(getOne).toHaveBeenCalledTimes(1);
  });

  it('marks a range as capped when the read was full and ends before it', async () => {
    getRecent.mockResolvedValue(Array.from({ length: 100 }, (_, i) => (i === 0 ? kid('k', 'a', 1) : kid(`r${i}`, 'a', 2 + i * 0.1))));
    getOne.mockResolvedValue(root('a'));
    const { result } = renderHook(() => useMostBranched('90'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.capped).toBe(true);
    expect(result.current.coverageStartMs).toBeGreaterThan(now - 90 * DAY);
  });

  it('drops a deleted root and still fills three from six ranked', async () => {
    getRecent.mockResolvedValue(['a', 'b', 'c', 'd'].flatMap((id, i) => Array.from({ length: 5 - i }, (_, n) => kid(`${id}${n}`, id, 1))));
    getOne.mockImplementation(async (id: string) => (id === 'a' ? null : root(id)));
    const { result } = renderHook(() => useMostBranched('90'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tiles.map((t) => t.id)).toEqual(['b', 'c', 'd']);
  });

  it('reports a failed read as most-branched, shows none, and retries on the next mount', async () => {
    getRecent.mockRejectedValueOnce(new Error('boom'));
    const a = renderHook(() => useMostBranched('90'));
    await waitFor(() => expect(a.result.current.status).toBe('none'));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'most-branched');
    a.unmount();
    getRecent.mockResolvedValue([root('a'), kid('k1', 'a', 1)]);
    const b = renderHook(() => useMostBranched('90'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(getRecent).toHaveBeenCalledTimes(2);
  });

  it('reads nothing in local-only mode', () => {
    firebase.isFirebaseConfigured = false;
    const { result } = renderHook(() => useMostBranched('90'));
    expect(result.current.tiles).toEqual([]);
    expect(getRecent).not.toHaveBeenCalled();
  });
});
