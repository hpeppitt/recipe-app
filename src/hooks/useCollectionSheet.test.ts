// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SAVE_WINDOW_MS, isPointerClick, useCollectionSheet } from './useCollectionSheet';

type Props = { id: string; fav: boolean; verified: boolean };
const setup = (init: Props = { id: 'r1', fav: false, verified: true }) =>
  renderHook((p: Props) => useCollectionSheet(p.id, p.fav, p.verified), { initialProps: init });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCollectionSheet', () => {
  it('opens when the favourite flips on inside the window', () => {
    const h = setup();
    act(() => h.result.current.onSaveTap());
    act(() => void vi.advanceTimersByTime(SAVE_WINDOW_MS - 1));
    h.rerender({ id: 'r1', fav: true, verified: true });
    expect(h.result.current.open).toBe(true);
    act(() => h.result.current.close());
    expect(h.result.current.open).toBe(false);
  });

  it('does not open when the flip is outside the window', () => {
    const h = setup();
    act(() => h.result.current.onSaveTap());
    act(() => void vi.advanceTimersByTime(SAVE_WINDOW_MS + 1));
    h.rerender({ id: 'r1', fav: true, verified: true });
    expect(h.result.current.open).toBe(false);
  });

  it('does not open for an unsave, an untapped flip or an unverified user', () => {
    const un = setup({ id: 'r1', fav: true, verified: true });
    act(() => un.result.current.onSaveTap());
    un.rerender({ id: 'r1', fav: false, verified: true });
    expect(un.result.current.open).toBe(false);
    const none = setup();
    none.rerender({ id: 'r1', fav: true, verified: true });
    expect(none.result.current.open).toBe(false);
    const guest = setup({ id: 'r1', fav: false, verified: false });
    act(() => guest.result.current.onSaveTap());
    guest.rerender({ id: 'r1', fav: true, verified: false });
    expect(guest.result.current.open).toBe(false);
  });

  it('drops a tap and closes when the recipe changes', () => {
    const h = setup();
    act(() => h.result.current.onSaveTap());
    h.rerender({ id: 'r2', fav: true, verified: true });
    expect(h.result.current.open).toBe(false);
    const o = setup();
    act(() => o.result.current.onSaveTap());
    o.rerender({ id: 'r1', fav: true, verified: true });
    expect(o.result.current.open).toBe(true);
    o.rerender({ id: 'r2', fav: true, verified: true });
    expect(o.result.current.open).toBe(false);
  });
});

describe('isPointerClick', () => {
  it('counts a click right after a touch or mouse pointerdown, even where click has no pointerType', () => {
    document.dispatchEvent(new MouseEvent('pointerdown'));
    // jsdom has no PointerEvent: give the event the type the listener reads.
    const down = Object.assign(new Event('pointerdown'), { pointerType: 'touch' });
    document.dispatchEvent(down);
    expect(isPointerClick({ detail: 1 })).toBe(true);
  });

  it('refuses a keyboard click (detail 0), and a click long after the pointerdown', () => {
    document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse' }));
    expect(isPointerClick({ detail: 0 })).toBe(false);
    expect(isPointerClick({ detail: 1 }, Date.now() + 1500)).toBe(false);
  });

  it('refuses a click after a non-pointer pointerdown type', () => {
    document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: '' }));
    expect(isPointerClick({ detail: 1 })).toBe(false);
  });
});
