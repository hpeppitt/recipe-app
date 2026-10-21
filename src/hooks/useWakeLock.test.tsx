// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function mockWakeLock(request: () => Promise<{ release: () => Promise<void> }>) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn(request) }, configurable: true });
  return (navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } }).wakeLock.request;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useWakeLock (RL-203)', () => {
  it('requests the lock, releases it on unmount, and re-requests when visible again', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = mockWakeLock(() => Promise.resolve({ release }));
    const { result, unmount } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe(true);
    expect(request).toHaveBeenCalledWith('screen');
    await act(async () => setVisibility('hidden'));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility('visible'));
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(release).toHaveBeenCalled();
  });

  it('does nothing while inactive', () => {
    const request = mockWakeLock(() => Promise.resolve({ release: () => Promise.resolve() }));
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('reports a refusal', async () => {
    mockWakeLock(() => Promise.reject(new Error('NotAllowedError')));
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('reports no support when the API is missing', () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe(false);
  });
});
