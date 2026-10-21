// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getFamilyCooks = vi.fn();
vi.mock('../services/firestore', () => ({ getFamilyCooks: (...a: unknown[]) => getFamilyCooks(...a) }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useFamilyCooks, clearFamilyCooksCache } from './useFamilyCooks';

const now = Date.now();
const cook = (recipeId: string, uid: string) => ({ recipeId, rootId: 'r', uid, createdAt: now - 1000 });
// b: 3 people, r: 1 person (one person cooked r twice), so b leads (3 >= 3 and 3 >= 3x1).
const cooks = [cook('b', 'u1'), cook('b', 'u2'), cook('b', 'u3'), cook('b', 'u1'), cook('r', 'u4'), cook('r', 'u4')];

beforeEach(() => {
  getFamilyCooks.mockReset();
  reportError.mockReset();
  clearFamilyCooksCache();
});

describe('useFamilyCooks', () => {
  it('counts distinct people per version and in the family, and finds the leader', async () => {
    getFamilyCooks.mockResolvedValue(cooks);
    const { result } = renderHook(() => useFamilyCooks('r'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.countById.get('b')).toBe(3);
    expect(result.current.countById.get('r')).toBe(1);
    expect(result.current.total).toBe(4);
    expect(result.current.leaderId).toBe('b');
  });

  it('reads once per family per session', async () => {
    getFamilyCooks.mockResolvedValue(cooks);
    const a = renderHook(() => useFamilyCooks('r'));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    a.unmount();
    const b = renderHook(() => useFamilyCooks('r'));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(getFamilyCooks).toHaveBeenCalledTimes(1);
  });

  it('returns empty on failure, reports family-cooks and retries on the next mount', async () => {
    getFamilyCooks.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(cooks);
    const a = renderHook(() => useFamilyCooks('r'));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.total).toBe(0);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'family-cooks');
    a.unmount();
    // Inside the 60 s cooldown the failure is not retried.
    const early = renderHook(() => useFamilyCooks('r'));
    await waitFor(() => expect(early.result.current.loading).toBe(false));
    expect(getFamilyCooks).toHaveBeenCalledTimes(1);
    early.unmount();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
    const b = renderHook(() => useFamilyCooks('r'));
    await waitFor(() => expect(b.result.current.total).toBe(4));
    expect(getFamilyCooks).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('does not report a failed-precondition (missing index)', async () => {
    getFamilyCooks.mockRejectedValue(Object.assign(new Error('index'), { code: 'failed-precondition' }));
    const a = renderHook(() => useFamilyCooks('r'));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(reportError).not.toHaveBeenCalled();
  });

  it('keeps at most 30 families, dropping the oldest', async () => {
    getFamilyCooks.mockResolvedValue(cooks);
    for (let i = 0; i < 31; i++) {
      const h = renderHook(() => useFamilyCooks(`f${i}`));
      await waitFor(() => expect(h.result.current.loading).toBe(false));
      h.unmount();
    }
    expect(getFamilyCooks).toHaveBeenCalledTimes(31);
    const again = renderHook(() => useFamilyCooks('f0'));
    await waitFor(() => expect(again.result.current.loading).toBe(false));
    expect(getFamilyCooks).toHaveBeenCalledTimes(32);
  });
});
