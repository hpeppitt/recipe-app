// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import type { AppUser } from '../types/recipe';

let recipe = makeRecipe({ id: 'r1', title: 'Soup' });
let ancestors: ReturnType<typeof makeRecipe>[] = [];
let lineageChildren: ReturnType<typeof makeRecipe>[] = [];
let family: ReturnType<typeof makeRecipe>[] = [];
let treeLoading = false;
let canFavorite = true;
let isFavorite = false;
let source: 'local' | 'cloud' = 'local';
let pending = 0;
let suggestionRows: Record<string, unknown>[] | null = null;
const applyMock = vi.fn();
const keepAsBranchMock = vi.fn();
const rejectMock = vi.fn();
const getPublishedRecipe = vi.fn();
const publishRecipe = vi.fn();
const trackRecipeShared = vi.fn();
const firebase = vi.hoisted(() => ({ isFirebaseConfigured: true }));
const calls: string[] = [];
const deletePublishedRecipeTree = vi.fn();
const deleteRecipeTree = vi.fn();
const deletePublishedVersion = vi.fn();
const reparentChildren = vi.fn();
const getRecipeTree = vi.fn();
const isRecipeGoneOnServer = vi.fn();
const getSubtreeIds = vi.fn();
const navigateSpy = vi.fn();
const submitMock = vi.fn();
const recipeIds: (string | undefined)[] = [];

vi.mock('../services/firestore', () => ({
  getRelatedFamilies: async () => [],
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  incrementRecipeViews: vi.fn(),
  deletePublishedRecipeTree: (...a: unknown[]) => deletePublishedRecipeTree(...a),
  deletePublishedVersion: (...a: unknown[]) => deletePublishedVersion(...a),
  isRecipeGoneOnServer: (...a: unknown[]) => isRecipeGoneOnServer(...a),
}));
vi.mock('../db/recipes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/recipes')>()),
  deleteRecipeTree: (...a: unknown[]) => deleteRecipeTree(...a),
  getSubtreeIds: (...a: unknown[]) => getSubtreeIds(...a),
  reparentChildren: (...a: unknown[]) => reparentChildren(...a),
  getRecipeTree: (...a: unknown[]) => getRecipeTree(...a),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock('../services/firebase', () => ({
  get isFirebaseConfigured() {
    return firebase.isFirebaseConfigured;
  },
}));
vi.mock('../services/analytics', () => ({
  trackRecipeViewed: vi.fn(),
  trackRecipeShared: (...a: unknown[]) => trackRecipeShared(...a),
  trackRecipeDeleted: vi.fn(),
}));
vi.mock('../hooks/useRecipe', () => ({
  useRecipe: (id?: string) => {
    recipeIds.push(id);
    return { recipe, source, isLoading: false, cloudError: false, retry: () => {} };
  },
  useRecipeLineage: () => ({ children: lineageChildren, ancestors, descendantCount: lineageChildren.length, recipes: family, isLoading: treeLoading }),
}));
vi.mock('../hooks/useFavorites', () => ({
  useFavorite: () => ({ isFavorite, toggleFavorite: vi.fn(), canFavorite }),
}));
vi.mock('../hooks/useSuggestions', () => ({
  useSuggestions: () => ({
    suggestions: suggestionRows ?? Array.from({ length: pending }, (_, i) => ({ id: `s${i}`, status: 'pending', suggestedBy: { uid: 'x' }, message: 'm', createdAt: 0 })), apply: applyMock, keepAsBranch: keepAsBranchMock, reject: rejectMock }),
  useSubmitSuggestion: () => ({ submit: (...a: unknown[]) => submitMock(...a) }),
  useSuggestionThread: () => ({ messages: [], error: null, send: vi.fn() }),
}));

import { RecipeDetailPage } from './RecipeDetailPage';

const anon: AppUser = { uid: 'anon-1', displayName: 'Waffle', email: null, isAnonymous: true, emailVerified: false };
const writeText = vi.fn();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  vi.clearAllMocks();
  firebase.isFirebaseConfigured = true;
  ancestors = [];
  lineageChildren = [];
  family = [];
  treeLoading = false;
  canFavorite = true;
  isFavorite = false;
  source = 'local';
  pending = 0;
  suggestionRows = null;
  recipe = makeRecipe({ id: 'r1', title: 'Soup' });
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

function share(user: AppUser | null) {
  renderWithProviders(
    <Routes>
      <Route path="/recipe/:id" element={<RecipeDetailPage />} />
    </Routes>,
    { route: '/recipe/r1', user }
  );
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
}

const dialog = () => screen.queryByRole('heading', { name: 'Sign in to share this recipe' });

describe('RecipeDetailPage Share', () => {
  it.each([
    ['anonymous', anon],
    ['signed-out', null],
  ])('opens the sign-up dialog for a %s user on an unpublished recipe', async (_l, user) => {
    getPublishedRecipe.mockResolvedValue(null);
    share(user);
    expect(await screen.findByRole('heading', { name: 'Sign in to share this recipe' })).toBeInTheDocument();
    expect(publishRecipe).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(trackRecipeShared).not.toHaveBeenCalled();
  });

  it('copies the cloud link for an anonymous user on a published recipe', async () => {
    getPublishedRecipe.mockResolvedValue({ id: 'r1' });
    share(anon);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/shared\/r1$/)));
    expect(dialog()).not.toBeInTheDocument();
    expect(publishRecipe).not.toHaveBeenCalled();
    expect(trackRecipeShared).toHaveBeenCalledWith('r1');
  });

  it('opens the dialog, not a self-contained link, when the published check rejects', async () => {
    getPublishedRecipe.mockRejectedValue(new Error('offline'));
    share(anon);
    expect(await screen.findByRole('heading', { name: 'Sign in to share this recipe' })).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the cloud link for a verified user when the recipe is published', async () => {
    getPublishedRecipe.mockResolvedValue({ id: 'r1' });
    share(fakeUser);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/shared\/r1$/)));
    expect(dialog()).not.toBeInTheDocument();
  });

  it('copies a self-contained link when Firebase is not configured', async () => {
    firebase.isFirebaseConfigured = false;
    share(null);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/shared#r=')));
    expect(dialog()).not.toBeInTheDocument();
    expect(getPublishedRecipe).not.toHaveBeenCalled();
  });
});

describe('RecipeDetailPage What changed link', () => {
  const show = () =>
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user: fakeUser }
    );

  it('links a variation to its changes screen', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Soup', parentId: 'p', depth: 1, prompt: 'less salt' });
    show();
    expect(screen.getByRole('link', { name: 'See what changed' }).getAttribute('href')).toBe('/recipe/r1/changes');
  });

  it('shows no link on a root recipe', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Soup' });
    show();
    expect(screen.queryByRole('link', { name: 'See what changed' })).toBeNull();
  });
});

describe('RecipeDetailPage Delete', () => {
  beforeEach(() => {
    calls.length = 0;
    getSubtreeIds.mockResolvedValue(['r1', 'r2']);
    deleteRecipeTree.mockImplementation(async () => {
      calls.push('local');
      return ['r1', 'r2'];
    });
  });

  async function confirmDelete(user: AppUser | null) {
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user }
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  }

  const cloudFails = () =>
    deletePublishedRecipeTree.mockImplementationOnce(async () => {
      calls.push('cloud');
      return { deleted: 0, failed: 2, skipped: 0 };
    });
  const cloudSucceeds = () =>
    deletePublishedRecipeTree.mockImplementation(async () => {
      calls.push('cloud');
      return { deleted: 2, failed: 0, skipped: 0 };
    });
  const failure = () => screen.queryByRole('heading', { name: "Couldn't delete this recipe" });

  it('removes the cloud copy, then the device copy, then leaves, for a verified user', async () => {
    cloudSucceeds();
    await confirmDelete(fakeUser);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
    expect(calls).toEqual(['cloud', 'local']);
    expect(deletePublishedRecipeTree).toHaveBeenCalledWith(fakeUser.uid, 'r1', recipe.rootId, ['r1', 'r2']);
  });

  it('keeps the device copy and shows the failure dialog when the cloud delete fails', async () => {
    cloudFails();
    await confirmDelete(fakeUser);
    expect(await screen.findByRole('heading', { name: "Couldn't delete this recipe" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "It's still saved in your account and on this device. Check your connection and try again. 2 copies couldn't be removed."
      )
    ).toBeInTheDocument();
    expect(deleteRecipeTree).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Leave anyway' })).not.toBeInTheDocument();
  });

  it('Try again repeats the delete and leaves once it succeeds', async () => {
    cloudFails();
    await confirmDelete(fakeUser);
    await screen.findByRole('heading', { name: "Couldn't delete this recipe" });
    cloudSucceeds();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
    expect(calls).toEqual(['cloud', 'cloud', 'local']);
    expect(deletePublishedRecipeTree).toHaveBeenLastCalledWith(fakeUser.uid, 'r1', recipe.rootId, ['r1', 'r2']);
  });

  it('Cancel closes the failure dialog and stays on the recipe', async () => {
    cloudFails();
    await confirmDelete(fakeUser);
    await screen.findByRole('heading', { name: "Couldn't delete this recipe" });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(failure()).not.toBeInTheDocument());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(deleteRecipeTree).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { name: 'Soup' }).length).toBeGreaterThan(0);
  });

  it('deletes locally only for an anonymous user', async () => {
    await confirmDelete(anon);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/', { replace: true }));
    expect(deletePublishedRecipeTree).not.toHaveBeenCalled();
    expect(calls).toEqual(['local']);
  });
});

describe('RecipeDetailPage Delete version (RL-159)', () => {
  const root = makeRecipe({ id: 'r0', title: 'Root Soup', createdBy: { uid: fakeUser.uid, displayName: 'Me' } });
  const child = (id: string, uid = fakeUser.uid) =>
    makeRecipe({ id, parentId: 'r1', rootId: 'r0', depth: 2, createdBy: { uid, displayName: null } });

  beforeEach(() => {
    calls.length = 0;
    recipe = makeRecipe({ id: 'r1', title: 'Spicy Soup', parentId: 'r0', rootId: 'r0', depth: 1, createdBy: { uid: fakeUser.uid, displayName: 'Me' } });
    lineageChildren = [child('w1'), child('w2', 'bob'), child('w3', 'cy')];
    family = [root, recipe, ...lineageChildren];
    // Dexie holds the version, its own child and one the dialog never saw; not the other cooks' w2, w3.
    getRecipeTree.mockResolvedValue([root, recipe, child('w1'), child('late'), makeRecipe({ id: 'g', parentId: 'w1', rootId: 'r0' })]);
    reparentChildren.mockImplementation(async () => void calls.push('reparent'));
    deleteRecipeTree.mockImplementation(async () => {
      calls.push('local');
      return ['r1'];
    });
  });

  function openDialog(user: AppUser | null) {
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user }
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete version' }));
  }

  it.each([
    [0, "This can't be undone."],
    [1, 'Its branch stays, and moves up to Root Soup.'],
    [3, 'Its 3 branches stay, and move up to Root Soup.'],
  ])('says what happens to %i branches', async (n, copy) => {
    lineageChildren = lineageChildren.slice(0, n);
    openDialog(fakeUser);
    expect(await screen.findByRole('heading', { name: 'Delete this version?' })).toBeInTheDocument();
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
  });

  it('deletes in the cloud, then moves the children on the device, then opens the parent', async () => {
    deletePublishedVersion.mockImplementation(async () => void calls.push('cloud'));
    openDialog(fakeUser);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/recipe/r0', { replace: true }));
    expect(calls).toEqual(['cloud', 'reparent', 'local']);
    expect(deletePublishedVersion).toHaveBeenCalledWith(fakeUser.uid, recipe, ['w1', 'w2', 'w3']);
    expect(reparentChildren).toHaveBeenCalledWith(['w1', 'late'], 'r0');
    expect(deletePublishedRecipeTree).not.toHaveBeenCalled();
  });

  it('closes the dialog and focuses the parent title once it shows', async () => {
    deletePublishedVersion.mockResolvedValue(undefined);
    // The page stays mounted across the move; the next render shows the parent.
    navigateSpy.mockImplementationOnce(() => {
      recipe = root;
    });
    openDialog(fakeUser);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Root Soup' })).toHaveFocus());
    expect(screen.queryByRole('heading', { name: 'Delete this version?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deleting...' })).not.toBeInTheDocument();
  });

  it('Keep it returns focus to the More button', async () => {
    openDialog(fakeUser);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'More options' })).toHaveFocus());
  });

  it('disables the row while the family is loading', () => {
    treeLoading = true;
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user: fakeUser }
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: 'Delete version' })).toBeDisabled();
  });

  it('after a timeout, finishes on the device when the version turns out gone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      deletePublishedVersion.mockReturnValue(new Promise(() => {}));
      isRecipeGoneOnServer.mockResolvedValue(true);
      openDialog(fakeUser);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      await vi.advanceTimersByTimeAsync(10_000);
      await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/recipe/r0', { replace: true }));
      expect(calls).toEqual(['reparent', 'local']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('after a timeout with the version still there, says it may still finish', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      deletePublishedVersion.mockReturnValue(new Promise(() => {}));
      isRecipeGoneOnServer.mockResolvedValue(false);
      openDialog(fakeUser);
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await screen.findByText(/It may still finish when you're back online\./)).toBeInTheDocument();
      expect(reparentChildren).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the device untouched and shows the failure dialog when the cloud batch fails', async () => {
    deletePublishedVersion.mockRejectedValue(new Error('permission-denied'));
    openDialog(fakeUser);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { name: "Couldn't delete this version" })).toBeInTheDocument();
    expect(reparentChildren).not.toHaveBeenCalled();
    expect(deleteRecipeTree).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('says so, without Try again, when too many other cooks have branches', async () => {
    const { TooManyMovedBranchesError } = await import('../lib/errors');
    deletePublishedVersion.mockRejectedValue(new TooManyMovedBranchesError(9));
    openDialog(fakeUser);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { name: 'Too many branches to move' })).toBeInTheDocument();
    expect(screen.getByText("Other cooks have more than 8 branches on this version, so it can't be deleted.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(reparentChildren).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'More options' })).toHaveFocus());
  });

  it('refuses an original when the cloud finds another cook\'s version the page did not', async () => {
    recipe = root;
    family = [root];
    deletePublishedRecipeTree.mockResolvedValue({ deleted: 0, failed: 0, skipped: 2 });
    getSubtreeIds.mockResolvedValue(['r0']);
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r0', user: fakeUser }
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { name: 'The original stays' })).toBeInTheDocument();
    expect(deleteRecipeTree).not.toHaveBeenCalled();
  });

  it('does the local half only for an unverified owner', async () => {
    openDialog(anon);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/recipe/r0', { replace: true }));
    expect(deletePublishedVersion).not.toHaveBeenCalled();
    expect(calls).toEqual(['reparent', 'local']);
  });

  it('blocks deleting the original while another cook has a version in the family', () => {
    recipe = root;
    family = [root, makeRecipe({ id: 'b1', parentId: 'r0', rootId: 'r0', depth: 1, createdBy: { uid: 'bob', displayName: 'Bob' } })];
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r0', user: fakeUser }
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const row = screen.getByRole('button', { name: /^Delete/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveTextContent('Other cooks have branches here, so the original stays.');
    fireEvent.click(row);
    expect(screen.queryByRole('heading', { name: 'Delete Recipe' })).not.toBeInTheDocument();
  });
});

describe('RecipeDetailPage in the wide-screen pane (RL-116)', () => {
  it('reads the recipe from its id prop when rendered outside its own route', () => {
    recipeIds.length = 0;
    renderWithProviders(<RecipeDetailPage id="r1" />, { route: '/' });
    expect(recipeIds.at(-1)).toBe('r1');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Soup']);
  });

  it('drops its own main landmark, pads once and wraps the footer in the pane', () => {
    renderWithProviders(<RecipeDetailPage id="r1" />, { route: '/' });
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1 });
    // Wide sizes follow the pane's container, not the viewport, so a 384px pane keeps mobile sizes.
    expect(h1).toHaveClass('@xl:text-[44px]');
    expect(h1).not.toHaveClass('lg:text-[44px]');
    expect(h1.parentElement?.parentElement).not.toHaveClass('px-[22px]');
    expect(screen.getByRole('button', { name: 'Branch this recipe' }).parentElement).toHaveClass('flex-wrap');
  });

  it('keeps main, the viewport sizes and the unwrapped footer on its own route', () => {
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1' }
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('lg:text-[44px]');
    expect(screen.getByRole('button', { name: 'Branch this recipe' }).parentElement).not.toHaveClass('flex-wrap');
  });

  it('reports the shown title for the announcement', () => {
    const onShown = vi.fn();
    renderWithProviders(<RecipeDetailPage id="r1" onShown={onShown} />, { route: '/' });
    expect(onShown).toHaveBeenCalledWith('Soup');
  });

  it('below lg in the shell (2026-10-20): a div inside the shell main, with the narrow page styling', () => {
    renderWithProviders(<main><RecipeDetailPage id="r1" beside={false} /></main>, { route: '/' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('lg:text-[44px]');
    expect(screen.getByRole('button', { name: 'Branch this recipe' }).parentElement).not.toHaveClass('flex-wrap');
  });

  it('in the shell, sees the real navigation key and state, so Back steps back through history', () => {
    // What the page itself sees under the overridden location.
    function Seen() {
      const { pathname, key, state } = useLocation();
      return <p data-testid="seen">{`${pathname} ${key !== 'default'} ${JSON.stringify(state)}`}</p>;
    }
    // As AppRoutes does: the shell routes render against the list's pathname, keeping key and state.
    function Shell() {
      const location = useLocation();
      const inPane = location.pathname === '/recipe/r1';
      return (
        <Routes location={inPane ? { ...location, pathname: '/' } : location}>
          <Route
            path="/"
            element={
              inPane ? (
                <main>
                  <RecipeDetailPage id="r1" beside={false} />
                  <Seen />
                </main>
              ) : (
                <Link to="/recipe/r1" state={{ listOrigin: '/' }}>Row</Link>
              )
            }
          />
        </Routes>
      );
    }
    renderWithProviders(<Shell />, { route: '/' });
    fireEvent.click(screen.getByRole('link', { name: 'Row' }));
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByTestId('seen')).toHaveTextContent('/ true {"listOrigin":"/"}');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it('offers Family in the footer, which opens the tree', () => {
    renderWithProviders(<RecipeDetailPage id="r1" />, { route: '/' });
    fireEvent.click(screen.getByRole('button', { name: 'Family' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1/tree');
  });

  it('at lg the Family button and tree icon open the family panel instead', () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
    try {
      renderWithProviders(<RecipeDetailPage id="r1" />, { route: '/' });
      fireEvent.click(screen.getByRole('button', { name: 'Family' }));
      expect(screen.getByRole('heading', { name: 'Soup family' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('heading', { name: 'Soup family' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Version tree' }));
      expect(screen.getByRole('heading', { name: 'Soup family' })).toBeInTheDocument();
      expect(navigateSpy).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error jsdom has no matchMedia; restore that
      delete window.matchMedia;
    }
  });
});

describe('RecipeDetailPage header and More sheet', () => {
  const show = (user: AppUser | null = fakeUser) =>
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user }
    );
  const openMenu = (name = 'More options') => fireEvent.click(screen.getByRole('button', { name }));
  const rows = () =>
    within(screen.getByRole('dialog', { name: 'Recipe options' }))
      .getAllByRole('button')
      .map((b) => b.textContent);

  it('has exactly one h1, the recipe title', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Soup']);
  });

  it('lists the owner rows in order, under the sheet name "Recipe options"', () => {
    show();
    openMenu();
    expect(rows()).toEqual(['Edit recipe', 'Delete', 'See the family', 'Copy share link']);
  });

  it('lists Suggest a change, and no Edit or Delete, for someone else on a cloud recipe', () => {
    source = 'cloud';
    show(anon);
    openMenu();
    expect(rows()).toEqual(['Suggest a change', 'See the family', 'Copy share link']);
  });

  it('keeps the pending badge and its accessible name', () => {
    pending = 2;
    show();
    const more = screen.getByRole('button', { name: 'More options, 2 suggestions pending' });
    expect(more.textContent).toBe('2');
  });

  it('opens sign-in from Save when signed out', () => {
    canFavorite = false;
    show(null);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    const sheet = screen.getByRole('dialog', { name: 'Sign in to save this recipe' });
    expect(within(sheet).getByRole('button', { name: 'Continue without an account' })).toBeInTheDocument();
  });

  it('counts saves under the title, and nothing for 0', () => {
    const withCount = (n: number) => ({ ...makeRecipe({ id: 'r1', title: 'Soup' }), favoriteCount: n });
    for (const [n, text] of [[3, '3 saves'], [1, '1 save']] as const) {
      recipe = withCount(n) as never;
      const { unmount } = show(null);
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
    recipe = withCount(0) as never;
    show(null);
    expect(screen.queryByText(/^\d+ saves?$/)).toBeNull();
  });

  it('shows Save pressed for a favourited recipe', () => {
    isFavorite = true;
    show();
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('goes to the edit screen from the sheet', () => {
    show();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1/edit');
  });

  it('goes to the tree from the sheet and links to it from the header', () => {
    show();
    expect(screen.getByRole('link', { name: 'Version tree' }).getAttribute('href')).toBe('/recipe/r1/tree');
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'See the family' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1/tree');
  });

  it('shows the family label for a branch once the lineage has loaded', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Chunky', parentId: 'p', depth: 1, prompt: 'x' });
    ancestors = [makeRecipe({ id: 'p', title: 'Banana bread', emoji: '🍌' })];
    show();
    expect(screen.getByText('🍌 Banana bread variation')).toBeInTheDocument();
  });

  it('shows the version pill on a branch', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Chunky', parentId: 'p', depth: 1, prompt: 'x' });
    ancestors = [makeRecipe({ id: 'p', title: 'Banana bread', emoji: '🍌' })];
    show();
    expect(screen.getByText(/Generation 2/).closest('span')).toHaveTextContent('Generation 2 · from Banana bread');
    expect(screen.getByRole('button', { name: /Path/ })).toBeInTheDocument();
  });
});

describe('RecipeDetailPage footer', () => {
  const show = (user: AppUser | null = fakeUser) =>
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user }
    );
  const footerNames = () =>
    screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t === 'Edit' || t === 'Suggest' || t === 'Branch this recipe');

  it('owner: Edit and Branch this recipe, no Suggest', () => {
    show();
    expect(footerNames()).toEqual(['Edit', 'Branch this recipe']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1/edit');
    fireEvent.click(screen.getByRole('button', { name: 'Branch this recipe' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1/vary');
  });

  it('signed out, Branch this recipe opens the sign-in sheet and does not navigate', () => {
    show(null);
    fireEvent.click(screen.getByRole('button', { name: 'Branch this recipe' }));
    expect(screen.getByRole('dialog', { name: 'Sign in to branch this recipe' })).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('non-owner on a cloud recipe: Suggest and Branch this recipe, no Edit', () => {
    source = 'cloud';
    show();
    expect(footerNames()).toEqual(['Suggest', 'Branch this recipe']);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(screen.getByText('Tap any line to suggest a change')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Suggest a Change' })).toBeNull();
  });

  it('a recipe on this device is yours: Edit and Branch, never Suggest', () => {
    source = 'local';
    show(anon);
    expect(footerNames()).toEqual(['Edit', 'Branch this recipe']);
  });

  it('the old labels are gone, for the owner and for a non-owner on a cloud recipe', () => {
    const { unmount } = show();
    expect(screen.queryByRole('button', { name: 'Create Variation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest a Change' })).toBeNull();
    unmount();
    source = 'cloud';
    show(anon);
    expect(screen.queryByRole('button', { name: 'Create Variation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest a Change' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeInTheDocument();
  });
});

describe('RecipeDetailPage suggest mode', () => {
  const show = (user: AppUser | null = fakeUser) =>
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1', user }
    );
  beforeEach(() => {
    source = 'cloud';
    recipe = makeRecipe({
      id: 'r1',
      title: 'Soup',
      createdBy: { uid: 'owner', displayName: 'Ada Lovelace' },
      ingredients: [{ amount: 2, unit: 'clove', name: 'garlic', notes: null, group: null }],
    });
  });

  it('swaps to the form from the footer and the sheet, hides the page chrome, and Cancel swaps back', () => {
    show();
    expect(screen.getByRole('button', { name: 'Branch this recipe' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(screen.queryByRole('button', { name: 'Branch this recipe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More options' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Branch this recipe' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }));
    expect(screen.getByText('Tap any line to suggest a change')).toBeInTheDocument();
  });

  it('asks anyone without a verified email to sign up and stays on the page', () => {
    show(anon);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(screen.getByRole('dialog', { name: 'Sign in to suggest a change' })).toBeInTheDocument();
    expect(screen.queryByText('Tap any line to suggest a change')).toBeNull();
  });

  it('sends through the existing submit, then shows Sent to the author on the page', async () => {
    submitMock.mockResolvedValue(undefined);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to 2 clove garlic' }));
    fireEvent.change(screen.getByLabelText('New amount'), { target: { value: '4 cloves' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ada' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sent to Ada Lovelace'));
    expect(submitMock).toHaveBeenCalledWith({
      recipeId: 'r1',
      recipeOwnerId: 'owner',
      recipeTitle: 'Soup',
      recipeEmoji: '🍳',
      message: 'Change 2 clove garlic to 4 cloves.',
      edits: [{ kind: 'ingredient', index: 0, name: 'garlic', from: '2 clove', to: '4 cloves' }],
    });
    expect(screen.getByRole('button', { name: 'Branch this recipe' })).toBeInTheDocument();
  });
});

describe('RecipeDetailPage suggestions', () => {
  const row = (id: string, uid: string, message: string, status = 'pending') => ({
    id, status, message, createdAt: 0, recipeOwnerId: 'test-user', suggestedBy: { uid, displayName: uid },
  });
  function open(over: { source?: 'local' | 'cloud' } = {}) {
    source = over.source ?? 'local';
    renderWithProviders(
      <Routes>
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
      </Routes>,
      { route: '/recipe/r1' }
    );
  }

  it('owner sees every suggestion', () => {
    suggestionRows = [row('a', 'u1', 'More garlic'), row('b', 'u2', 'Add lime')];
    open();
    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();
    expect(screen.getByText('More garlic')).toBeInTheDocument();
    expect(screen.getByText('Add lime')).toBeInTheDocument();
  });

  it('someone else sees only their own suggestion', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Soup', createdBy: { uid: 'chef', displayName: 'Chef' } });
    suggestionRows = [row('a', 'test-user', 'Mine'), row('b', 'u2', 'Theirs')];
    open({ source: 'cloud' });
    expect(screen.getByRole('heading', { name: 'Your suggestion' })).toBeInTheDocument();
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.queryByText('Theirs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('has no section without suggestions', () => {
    open();
    expect(screen.queryByRole('region', { name: 'Suggestions' })).not.toBeInTheDocument();
  });

  it('sits after the recipe body', () => {
    recipe = makeRecipe({ id: 'r1', title: 'Soup', instructions: [{ step: 1, text: 'Boil.' }] as never });
    suggestionRows = [row('a', 'u1', 'More garlic')];
    open();
    const section = screen.getByRole('region', { name: 'Suggestions' });
    const method = screen.getByRole('heading', { name: 'Method' });
    expect(method.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Apply applies the suggestion to this recipe and stays (RL-148)', async () => {
    applyMock.mockResolvedValue(undefined);
    suggestionRows = [row('a', 'u1', 'More garlic')];
    open();
    fireEvent.click(screen.getByRole('button', { name: /^Mark applied suggestion from/ }));
    await waitFor(() => expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), recipe));
    expect(navigateSpy).not.toHaveBeenCalledWith('/recipe/r1/vary', expect.anything());
  });

  it('a failed Apply shows the apply error', async () => {
    applyMock.mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    suggestionRows = [row('a', 'u1', 'More garlic')];
    open();
    fireEvent.click(screen.getByRole('button', { name: /^Mark applied suggestion from/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't apply that suggestion. Please try again.");
  });

  it('Decline confirms, then a failed reject shows the decline error', async () => {
    rejectMock.mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    suggestionRows = [row('a', 'u1', 'More garlic')];
    open();
    fireEvent.click(screen.getByRole('button', { name: /^Decline suggestion from/ }));
    expect(rejectMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Decline this suggestion?' })).getByRole('button', { name: 'Decline' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't decline that suggestion. Please try again.");
    expect(rejectMock).toHaveBeenCalledWith('a');
  });
});
