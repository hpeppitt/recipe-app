// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ListAddedToast } from './ListAddedToast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = (toast: { text: string; view: boolean } | null, onDismiss = vi.fn()) =>
  render(
    <MemoryRouter>
      <ListAddedToast toast={toast} onDismiss={onDismiss} />
    </MemoryRouter>
  );

describe('ListAddedToast', () => {
  it('keeps its status region mounted when empty', () => {
    show(null);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('dismisses after 8 s with View and 5 s without', () => {
    vi.useFakeTimers();
    const a = vi.fn();
    show({ text: 'Added', view: true }, a);
    act(() => void vi.advanceTimersByTime(7999));
    expect(a).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(a).toHaveBeenCalledTimes(1);
    cleanup();
    const b = vi.fn();
    show({ text: 'Failed', view: false }, b);
    act(() => void vi.advanceTimersByTime(5000));
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('waits while hovered', () => {
    vi.useFakeTimers();
    const d = vi.fn();
    show({ text: 'Failed', view: false }, d);
    const region = screen.getByRole('status');
    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(20000));
    expect(d).not.toHaveBeenCalled();
    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(5000));
    expect(d).toHaveBeenCalledTimes(1);
  });

  it('a parent re-render with a new onDismiss does not restart the timer', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const toast = { text: 'Failed', view: false };
    const tree = (fn: () => void) => (
      <MemoryRouter>
        <ListAddedToast toast={toast} onDismiss={fn} />
      </MemoryRouter>
    );
    const { rerender } = render(tree(first));
    act(() => void vi.advanceTimersByTime(3000));
    rerender(tree(second));
    act(() => void vi.advanceTimersByTime(2000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a new toast starts unheld', () => {
    vi.useFakeTimers();
    const d = vi.fn();
    const tree = (text: string) => (
      <MemoryRouter>
        <ListAddedToast toast={{ text, view: false }} onDismiss={d} />
      </MemoryRouter>
    );
    const { rerender } = render(tree('one'));
    fireEvent.pointerEnter(screen.getByRole('status'), { pointerType: 'mouse' });
    rerender(tree('two'));
    act(() => void vi.advanceTimersByTime(5000));
    expect(d).toHaveBeenCalledTimes(1);
  });
});
