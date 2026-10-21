// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getRecentCooks = vi.fn();
vi.mock('../services/firestore', () => ({ getRecentCooks: (...a: unknown[]) => getRecentCooks(...a) }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useRecentCooks, clearRecentCooksCache } from './useRecentCooks';

const cooks = [{ recipeId: 'a', rootId: 'a', uid: 'u', createdAt: Date.now() }];

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

beforeEach(() => {
  getRecentCooks.mockReset();
  reportError.mockReset();
  localStorage.clear();
  clearRecentCooksCache();
});

describe('useRecentCooks', () => {
  it('reads once per session and writes the 6 hour cache', async () => {
    getRecentCooks.mockResolvedValue(cooks);
    const a = renderHook(() => useRecentCooks());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    a.unmount();
    const b = renderHook(() => useRecentCooks());
    await waitFor(() => expect(b.result.current.cooks).toEqual(cooks));
    expect(getRecentCooks).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('recipe-lab-recent-cooks')).toContain('"recipeId":"a"');
  });

  it('uses a fresh stored cache without reading, and treats a stale one as a miss', async () => {
    localStorage.setItem('recipe-lab-recent-cooks', JSON.stringify({ at: Date.now() - 1000, cooks }));
    const a = renderHook(() => useRecentCooks());
    await waitFor(() => expect(a.result.current.cooks).toEqual(cooks));
    expect(getRecentCooks).not.toHaveBeenCalled();

    clearRecentCooksCache();
    localStorage.setItem('recipe-lab-recent-cooks', JSON.stringify({ at: Date.now() - 7 * 3600_000, cooks }));
    getRecentCooks.mockResolvedValue([]);
    renderHook(() => useRecentCooks());
    await waitFor(() => expect(getRecentCooks).toHaveBeenCalledTimes(1));
    expect(getRecentCooks.mock.calls[0][0]).toBeGreaterThan(Date.now() - 91 * 86_400_000);
  });

  it('a failure returns empty, is reported as recent-cooks, is not cached, and retries', async () => {
    getRecentCooks.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(cooks);
    const a = renderHook(() => useRecentCooks());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.cooks).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'recent-cooks');
    expect(localStorage.getItem('recipe-lab-recent-cooks')).toBeNull();
    a.unmount();
    const b = renderHook(() => useRecentCooks());
    await waitFor(() => expect(b.result.current.cooks).toEqual(cooks));
  });
});

describe('useRecentCooks empty result', () => {
  it('does not write an empty list to the cache', async () => {
    getRecentCooks.mockResolvedValue([]);
    const a = renderHook(() => useRecentCooks());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(localStorage.getItem('recipe-lab-recent-cooks')).toBeNull();
  });
});
