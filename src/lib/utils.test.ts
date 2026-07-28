import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from './utils';

describe('withTimeout', () => {
  it('returns the resolved value when it beats the deadline', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'fallback')).resolves.toBe('ok');
  });

  it('returns the fallback when the promise rejects', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, 'fallback')).resolves.toBe(
      'fallback'
    );
  });

  it('returns the fallback when the promise never settles', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<string>(() => {});
      const result = withTimeout(pending, 4000, 'fallback');
      await vi.advanceTimersByTimeAsync(4000);
      await expect(result).resolves.toBe('fallback');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a late resolution after the deadline has already fired', async () => {
    vi.useFakeTimers();
    try {
      let release: (v: string) => void = () => {};
      const slow = new Promise<string>((res) => {
        release = res;
      });
      const result = withTimeout(slow, 1000, 'fallback');

      await vi.advanceTimersByTimeAsync(1000);
      release('too late');

      await expect(result).resolves.toBe('fallback');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not leave the timer pending after an early resolve', async () => {
    vi.useFakeTimers();
    try {
      await expect(withTimeout(Promise.resolve('fast'), 5000, 'fallback')).resolves.toBe('fast');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
