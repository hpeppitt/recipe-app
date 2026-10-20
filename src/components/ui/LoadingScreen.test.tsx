// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from './LoadingScreen';

const stubMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener: () => {}, removeEventListener: () => {} }));

afterEach(() => vi.unstubAllGlobals());

describe('LoadingScreen', () => {
  it('is a status with the default and a custom name', () => {
    stubMotion(false);
    const { unmount } = render(<LoadingScreen variant="full" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    unmount();
    render(<LoadingScreen variant="inline" label="Growing your branch" />);
    expect(screen.getByRole('status', { name: 'Growing your branch' })).toBeTruthy();
  });

  it('renders the grown tree and schedules no frame under reduced motion', () => {
    stubMotion(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const { container } = render(<LoadingScreen variant="full" />);
    const radii = [...container.querySelectorAll('circle')].slice(0, 8).map((c) => c.getAttribute('r'));
    expect(radii.map(Number)).toEqual([40, 42, 26, 28, 54, 38, 38, 40]);
    expect(raf).not.toHaveBeenCalled();
  });

  it('cancels its frame on unmount', () => {
    stubMotion(false);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    render(<LoadingScreen variant="full" />).unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
