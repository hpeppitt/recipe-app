// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(entry: { pathname: string; state?: unknown }, wide: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: () => {}, removeEventListener: () => {} }));
  render(
    <MemoryRouter initialEntries={[entry]}>
      <UpdatePrompt />
    </MemoryRouter>
  );
  return screen.getByRole('status');
}

describe('UpdatePrompt position', () => {
  it('sits beside the rail for a recipe in the wide-screen pane (RL-116)', () => {
    expect(renderAt({ pathname: '/recipe/r1', state: { listOrigin: '/' } }, true)).toHaveClass('lg:left-[220px]');
  });

  it('keeps the full-screen position for a recipe on its own', () => {
    expect(renderAt({ pathname: '/recipe/r1' }, true)).not.toHaveClass('lg:left-[220px]');
    cleanup();
    expect(renderAt({ pathname: '/recipe/r1', state: { listOrigin: '/' } }, false)).not.toHaveClass('lg:left-[220px]');
  });

  it('sits beside the rail on shell routes', () => {
    expect(renderAt({ pathname: '/saved' }, false)).toHaveClass('lg:left-[220px]');
  });
});
