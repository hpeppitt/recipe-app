// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { Link, MemoryRouter, useNavigate, useParams, useSearchParams } from 'react-router-dom';

// The real AppShell and route table run; pages and the shell's chrome are stand-ins.
const mounts = vi.hoisted(() => ({ explore: 0, saved: 0, recipe: 0, list: 0 }));
vi.mock('./pages/ExplorePage', () => ({
  ExplorePage: () => {
    useEffect(() => {
      mounts.explore++;
    }, []);
    const [tag, setTag] = useState('none');
    const navigate = useNavigate();
    return (
      <div>
        <p>Explore list</p>
        <button onClick={() => setTag('pasta')}>Tag: {tag}</button>
        <button onClick={() => navigate(1)}>Forward</button>
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
vi.mock('./pages/ShoppingListPage', () => ({
  ShoppingListPage: () => {
    useEffect(() => {
      mounts.list++;
    }, []);
    const [ticked, setTicked] = useState(false);
    const [params, setParams] = useSearchParams();
    return (
      <div>
        <p>Shopping list</p>
        <button onClick={() => setTicked(true)}>Milk {ticked ? 'ticked' : 'open'}</button>
        <button onClick={() => setParams({ mode: 'shop' }, { replace: true })}>Shop mode {params.get('mode') === 'shop' ? 'on' : 'off'}</button>
        <Link to="/recipe/k1" state={{ listOrigin: '/kitchen/list' }}>Chip k1</Link>
      </div>
    );
  },
}));
vi.mock('./pages/RecipeDetailPage', () => ({
  RecipeDetailPage: ({ id, onShown }: { id?: string; onShown?: (title: string) => void }) => {
    const params = useParams();
    const navigate = useNavigate();
    const shown = id ?? params.id;
    const [servings, setServings] = useState(1);
    useEffect(() => {
      mounts.recipe++;
    }, []);
    useEffect(() => {
      if (shown) onShown?.(`Title ${shown}`);
    }, [shown, onShown]);
    if (shown === 'boom') throw new Error('boom');
    return (
      <div>
        <h1>Recipe {id ?? params.id}</h1>
        <p>{id ? 'In the shell' : 'Own route'}</p>
        <button onClick={() => setServings((n) => n + 1)}>Servings {servings}</button>
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
  mounts.recipe = 0;
  mounts.list = 0;
  wide = false;
  listeners.clear();
  // jsdom has no scrolling; the shell moves offsets across a resize.
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

describe('AppRoutes below 1024px (behaves as before)', () => {
  it('opens a recipe from Explore alone, without the list or the nav', async () => {
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

  it('Back to Saved remounts the list too', async () => {
    renderAt('/saved');
    fireEvent.click(await screen.findByRole('link', { name: 'Row s1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Saved list')).toBeInTheDocument();
    expect(mounts.saved).toBe(2);
  });

  it('a direct visit with no list origin takes the plain route', async () => {
    renderAt('/recipe/r1');
    expect(await screen.findByText('Own route')).toBeInTheDocument();
    expect(nav()).not.toBeInTheDocument();
  });

  it('Forward after Back opens the recipe alone again, fresh, and unmounts the list', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Servings 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Forward' }));
    expect(await screen.findByRole('button', { name: 'Servings 1' })).toBeInTheDocument();
    expect(screen.getByText('In the shell')).toBeInTheDocument();
    expect(screen.queryByText('Explore list')).not.toBeInTheDocument();
    expect(mounts.recipe).toBe(2);
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

  it('keeps the list and recipe state across a resize to narrow and back', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Tag: none' }));
    fireEvent.click(screen.getByRole('link', { name: 'Row r1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Servings 1' }));

    setWide(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Recipe r1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Servings 2' })).toBeInTheDocument();
    expect(screen.getByText('Explore list')).not.toBeVisible();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(nav()).not.toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);

    setWide(true);
    expect(screen.getByRole('button', { name: 'Tag: pasta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Servings 2' })).toBeInTheDocument();
    // The status mounts empty, so the resize is not read out; the next choice is.
    expect(screen.getByRole('status')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('link', { name: 'Row r2' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Showing Title r2');
    expect(mounts).toMatchObject({ explore: 1, recipe: 1 });
  });

  it('after narrowing, Back shows the list as it was, and the next row opened starts fresh', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Tag: none' }));
    fireEvent.click(screen.getByRole('link', { name: 'Row r1' }));
    await screen.findByRole('heading', { level: 1, name: 'Recipe r1' });

    setWide(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Tag: pasta' })).toBeVisible();
    expect(mounts.explore).toBe(1);

    // Ordinary narrow navigation from here on: the list unmounts behind the recipe, as before.
    fireEvent.click(screen.getByRole('link', { name: 'Row r2' }));
    await screen.findByRole('heading', { level: 1, name: 'Recipe r2' });
    expect(screen.queryByText('Explore list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Tag: none' })).toBeInTheDocument();
    expect(mounts.explore).toBe(2);
  });

  it('moves the scroll offsets between the window and the pane across a resize', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    const scrollWindow = (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      fireEvent.scroll(window);
    };
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    await screen.findByRole('heading', { level: 1, name: 'Recipe r1' });
    scrollWindow(700);
    const pane = screen.getByRole('region', { name: 'Recipe' });
    pane.scrollTop = 300;
    fireEvent.scroll(pane);

    setWide(false);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
    scrollWindow(450);

    setWide(true);
    expect(pane.scrollTop).toBe(450);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 700);
  });
});

describe('AppRoutes across a resize from narrow', () => {
  it('keeps the recipe state when widening, and the list joins it', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Row r1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Servings 1' }));

    setWide(true);
    expect(await screen.findByText('Explore list')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Servings 2' })).toBeInTheDocument();
    expect(nav()).toBeInTheDocument();
    expect(mounts.recipe).toBe(1);

    setWide(false);
    expect(screen.getByRole('button', { name: 'Servings 2' })).toBeInTheDocument();
    expect(mounts.recipe).toBe(1);
  });

  it('still starts the list and the recipe fresh on ordinary narrow navigation', async () => {
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Tag: none' }));
    fireEvent.click(screen.getByRole('link', { name: 'Row r1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Servings 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Tag: none' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Row r1' }));
    expect(await screen.findByRole('button', { name: 'Servings 1' })).toBeInTheDocument();
    expect(mounts).toMatchObject({ explore: 2, recipe: 2 });
  });
});

describe('AppRoutes from a Kitchen list (RL-225)', () => {
  it('below 1024px shows the list without the nav and opens a recipe alone', async () => {
    renderAt('/kitchen/list');
    expect(await screen.findByText('Shopping list')).toBeInTheDocument();
    // jsdom has no CSS: the nav is in a wrapper hidden below lg, a rail from lg.
    expect(nav()?.parentElement).toHaveClass('hidden', 'lg:block');
    fireEvent.click(screen.getByRole('link', { name: 'Chip k1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe k1' })).toBeInTheDocument();
    expect(screen.queryByText('Shopping list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Shopping list')).toBeInTheDocument();
    expect(mounts.list).toBe(2);
  });

  it('from 1024px shows the recipe beside the list without remounting it', async () => {
    wide = true;
    renderAt('/kitchen/list');
    fireEvent.click(await screen.findByRole('button', { name: 'Milk open' }));
    fireEvent.click(screen.getByRole('link', { name: 'Chip k1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recipe k1' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recipe list' })).toHaveTextContent('Milk ticked');
    expect(screen.getByRole('region', { name: 'Recipe' })).toHaveTextContent('Recipe k1');
    expect(nav()?.parentElement).toHaveClass('lg:block');
    expect(mounts.list).toBe(1);
  });

  it('keeps ticks and the recipe across a resize to narrow and back', async () => {
    wide = true;
    renderAt('/kitchen/list');
    fireEvent.click(await screen.findByRole('button', { name: 'Milk open' }));
    fireEvent.click(screen.getByRole('link', { name: 'Chip k1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Servings 1' }));

    setWide(false);
    expect(screen.getByRole('button', { name: 'Servings 2' })).toBeInTheDocument();
    expect(screen.getByText('Shopping list')).not.toBeVisible();
    setWide(true);
    expect(screen.getByRole('button', { name: 'Milk ticked' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Servings 2' })).toBeInTheDocument();
    expect(mounts).toMatchObject({ list: 1, recipe: 1 });
  });

  it('keeps the shop mode flag and ticks on the list alone across a resize', async () => {
    renderAt('/kitchen/list');
    fireEvent.click(await screen.findByRole('button', { name: 'Milk open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shop mode off' }));
    setWide(true);
    expect(screen.getByRole('button', { name: 'Shop mode on' })).toBeInTheDocument();
    setWide(false);
    expect(screen.getByRole('button', { name: 'Milk ticked' })).toBeInTheDocument();
    expect(mounts.list).toBe(1);
  });
});
