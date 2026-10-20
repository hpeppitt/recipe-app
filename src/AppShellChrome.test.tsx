// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { reloadConsent } from './services/analytics';

// The real AppShell and ConsentBanner (consent unset); pages are stand-ins (2026-10-20).
vi.mock('./services/firebase', () => ({ isFirebaseConfigured: false }));
vi.mock('./pages/ExplorePage', () => ({
  ExplorePage: () => <Link to="/recipe/r1" state={{ listOrigin: '/' }}>Row r1</Link>,
}));
vi.mock('./pages/RecipeDetailPage', () => ({ RecipeDetailPage: () => <h1>Recipe</h1> }));
vi.mock('./components/layout/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('./components/auth/EmailLinkStatus', () => ({ EmailLinkStatus: () => null }));
vi.mock('./hooks/useOwnRecipesSync', () => ({ useOwnRecipesSync: () => {} }));

import { AppRoutes } from './App';

const mem = new Map<string, string>();
let wide = false;
const listeners = new Set<() => void>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com');
  reloadConsent();
  wide = false;
  listeners.clear();
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return wide;
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const banner = () => screen.queryByRole('region', { name: 'Analytics consent' });

describe('AppShell chrome around a recipe opened from a list', () => {
  it('shows the consent banner on the list, hides it on the recipe alone below lg, and shows it beside the list', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(banner()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Row r1' }));
    expect(await screen.findByRole('heading', { name: 'Recipe' })).toBeInTheDocument();
    expect(banner()).not.toBeInTheDocument();

    wide = true;
    act(() => listeners.forEach((l) => l()));
    expect(banner()).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recipe list' })).toBeInTheDocument();
  });
});
