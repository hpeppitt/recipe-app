// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Cook } from '../types/social';

const getRecipePhoto = vi.fn();
vi.mock('../services/firestore', () => ({ getRecipePhoto: (...a: unknown[]) => getRecipePhoto(...a) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useRecipePhoto } from './useRecipePhoto';

const photo = { cookId: 'c1', url: 'data:image/jpeg;base64,AA', name: 'Sam' };
const cooks = [{ id: 'c1' }] as Cook[];

beforeEach(() => vi.clearAllMocks());

describe('useRecipePhoto', () => {
  it('waits for the cook summary, then reads once per visit', async () => {
    getRecipePhoto.mockResolvedValue(photo);
    const { result, rerender } = renderHook(({ ready, c }) => useRecipePhoto('r1', c, ready), { initialProps: { ready: false, c: [] as Cook[] } });
    expect(getRecipePhoto).not.toHaveBeenCalled();
    rerender({ ready: true, c: cooks });
    await waitFor(() => expect(result.current.photo).toEqual(photo));
    rerender({ ready: true, c: [...cooks] });
    expect(getRecipePhoto).toHaveBeenCalledTimes(1);
    expect(getRecipePhoto).toHaveBeenCalledWith('r1', cooks);
  });

  it('re-reads after refresh', async () => {
    getRecipePhoto.mockResolvedValueOnce(photo).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useRecipePhoto('r1', [], true));
    await waitFor(() => expect(result.current.photo).toEqual(photo));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.photo).toBeNull());
  });

  it('reports a failure as recipe-photo and shows none', async () => {
    getRecipePhoto.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useRecipePhoto('r1', [], true));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'recipe-photo'));
    expect(result.current.photo).toBeNull();
  });

  it('clears the photo at once on refresh, even if the re-read fails', async () => {
    getRecipePhoto.mockResolvedValueOnce(photo).mockRejectedValueOnce(new Error('x'));
    const { result } = renderHook(() => useRecipePhoto('r1', [], true));
    await waitFor(() => expect(result.current.photo).toEqual(photo));
    act(() => result.current.refresh());
    expect(result.current.photo).toBeNull();
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(result.current.photo).toBeNull();
  });
});
