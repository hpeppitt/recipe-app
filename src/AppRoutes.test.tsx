// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { Link, MemoryRouter, useNavigate, useParams } from 'react-router-dom';

// The real AppShell and route table run; pages and the shell's chrome are stand-ins.
const mounts = vi.hoisted(() => ({ explore: 0, saved: 0 }));
vi.mock('./pages/ExplorePage', () => ({
  ExplorePage: () => {
    useEffect(() => {
      mounts.explore++;
    }, []);
    return (
      <div>
        <p>Explore list</p>
        <Link to="/recipe/r1" state={{ listOrigin: '/' }}>Row r1</Link>
        <Link to="/recipe/r2" state={{ listOrigin: '/' }}>Row r2</Link>
        <Link to="/recipe/boom" state={{ listOrigin: '/' }}>Row boom</Link>
      </div>
    );
  },
}));
vi.mock('./pages/SavedPage', () => ({
  SavedPage: () => {
    useEffect(() => {
      mounts.saved++;
    }, []);
    return (
      <div>
        <p>Saved list</p>
        <Link to="/recipe/s1" state={{ listOrigin: '/saved' }}>Row s1</Link>
      </div>
    );
  },
}));
vi.mock('./pages/RecipeDetailPage', () => ({
  RecipeDetailPage: ({ id, onShown }: { id?: string; onShown?: (title: string) => void }) => {
    const params = useParams();
    const navigate = useNavigate();
    const shown = id ?? params.id;
    useEffect(() => {
      if (shown) onShown?.(`Title ${shown}`);
    }, [shown, onShown]);
    if (shown === 'boom') throw new Error('boom');
    return (
      <div>
        <h1>Recipe {id ?? params.id}</h1>
        <button onClick={() => navigate(-1)}>Back</button>
      </div>
    );
  },
}));
vi.mock('./components/layout/BottomNav', () => ({ BottomNav: () => <nav aria-label="Main" /> }));
vi.mock('./components/layout/ConsentBanner', () => ({ ConsentBanner: () => null }));
vi.mock('./components/auth/EmailLinkStatus', () => ({ EmailLinkStatus: () => null }));
vi.mock('./components/layout/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
vi.mock('./components/auth/TermsUpdateDialog', () => ({ TermsGate: () => null }));
vi.mock('./services/analytics', () => ({ clearLeftoverGaCookies: () => {} }));
vi.mock('./services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('./hooks/useOwnRecipesSync', () => ({ useOwnRecipesSync: () => {} }));
vi.mock('./contexts/AuthContext', () => ({ AuthProvider: ({ children }: { children: unknown }) => children }));

import { AppRoutes } from './App';

// A controllable matchMedia: `setWide` flips every query and fires change.
let wide = false;
const listeners = new Set<() => void>();
function setWide(next: boolean) {
  wide = next;
  act(() => listeners.forEach((l) => l()));
}

beforeEach(() => {
  mounts.explore = 0;
  mounts.saved = 0;
  wide = false;
  listeners.clear();
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
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );
}

const nav = () => screen.queryByRole('navigation', { name: 'Main' });

describe('AppRoutes below 1024px (unchanged)', () => {
  it('opens a recipe from Explore on its own page, outside the shell', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe r1' })).toBeInTheDocument();
    expect(screen.queryByText('Explore list')).not.toBeInTheDocument();
    expect(nav()).not.toBeInTheDocument();
  });

  it('opens a recipe from Saved on its own page too', async () => {
    renderAt('/saved');
    fireEvent.click(await screen.findByRole('link', { name: 'Row s1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe s1' })).toBeInTheDocument();
    expect(screen.queryByText('Saved list')).not.toBeInTheDocument();
  });

  it('Back remounts the list, as before', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Explore list')).toBeInTheDocument();
    expect(mounts.explore).toBe(2);
  });
});

describe('AppRoutes at 1024px and wider', () => {
  beforeEach(() => {
    wide = true;
  });

  it('shows the Explore list and the recipe together, and swaps the recipe without remounting the list', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe r1' })).toBeInTheDocument();
    expect(screen.getByText('Explore list')).toBeInTheDocument();
    expect(nav()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Row r2' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe r2' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(mounts.explore).toBe(1);
  });

  it('Back returns to the list alone without remounting it', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: /^Recipe/ })).not.toBeInTheDocument();
    expect(screen.getByText('Explore list')).toBeInTheDocument();
    expect(mounts.explore).toBe(1);
  });

  it('shows the Saved list beside a recipe opened from it', async () => {
    renderAt('/saved');
    fireEvent.click(await screen.findByRole('link', { name: 'Row s1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe s1' })).toBeInTheDocument();
    expect(screen.getByText('Saved list')).toBeInTheDocument();
    expect(mounts.saved).toBe(1);
  });

  it('shows the recipe alone on a direct visit', async () => {
    renderAt('/recipe/r1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe r1' })).toBeInTheDocument();
    expect(screen.queryByText('Explore list')).not.toBeInTheDocument();
    expect(nav()).not.toBeInTheDocument();
  });

  it('names the two panes, keeps one main landmark and announces the shown recipe', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    await screen.findByRole('heading', { level: 1, name: 'Recipe r1' });
    expect(screen.getByRole('region', { name: 'Recipe list' })).toHaveTextContent('Explore list');
    expect(screen.getByRole('region', { name: 'Recipe' })).toHaveTextContent('Recipe r1');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Showing Title r1');

    fireEvent.click(screen.getByRole('link', { name: 'Row r2' }));
    await screen.findByRole('heading', { level: 1, name: 'Recipe r2' });
    expect(screen.getByRole('status')).toHaveTextContent('Showing Title r2');
  });

  it('recovers the pane after a recipe throws when another row is chosen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row boom' }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Explore list')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Row r2' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe r2' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(mounts.explore).toBe(1);
  });

  it('survives a resize across 1024px in both directions', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    await screen.findByText('Explore list');

    setWide(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe r1' })).toBeInTheDocument();
    expect(screen.queryByText('Explore list')).not.toBeInTheDocument();

    setWide(true);
    expect(await screen.findByText('Explore list')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Recipe r1' })).toBeInTheDocument();
  });
});
