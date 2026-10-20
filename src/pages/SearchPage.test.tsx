// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { Link, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { makeRecipe, makeIngredient } from '../test/factories';
import type { Recipe } from '../types/recipe';

const lib = vi.hoisted(() => ({
  local: undefined as Recipe[] | undefined,
  cloud: {
    recipes: null as Recipe[] | null,
    isLoading: false,
    cloudError: false,
    retryCloud: () => {},
    hasMore: false,
    loadingMore: false,
    loadMoreError: false,
    loadMore: async () => {},
  },
}));
vi.mock('../hooks/useRecipeLibrary', () => ({
  useLocalLibrary: () => lib.local,
  useCloudLibrary: () => lib.cloud,
}));

import { SearchPage } from './SearchPage';

function Probe() {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="probe">{`${pathname}${search}|${JSON.stringify(state)}`}</output>
      <button onClick={() => navigate(-1)}>history back</button>
    </>
  );
}

const render = (route = '/search', localOnly = false) =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        <Route path="/start" element={<Link to="/search">Go to search</Link>} />
        <Route path="*" element={null} />
      </Routes>
      <Probe />
    </>,
    { route, auth: localOnly ? { isConfigured: false } : undefined }
  );

const probe = () => screen.getByTestId('probe').textContent;
const type = (value: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search recipes, or describe a dish' }), { target: { value } });
const live = () => screen.getAllByRole('status').find((el) => el.getAttribute('aria-live') === 'polite')!;
const rowNames = () =>
  screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/recipe/')).map((a) => a.getAttribute('aria-label'));

const stew = makeRecipe({
  id: 'stew',
  title: 'Bean Stew',
  totalTime: 45,
  difficulty: 'medium',
  ingredients: [makeIngredient('walnut')],
  createdAt: 3,
});
const salad = makeRecipe({ id: 'salad', title: 'Quick Salad', totalTime: 10, difficulty: 'easy', createdAt: 2 });
const branch = makeRecipe({
  id: 'stew-b',
  parentId: 'stew',
  rootId: 'stew',
  depth: 1,
  title: 'Spicy Bean Stew',
  prompt: 'make it spicy',
  createdAt: 4,
});

beforeAll(() => {
  // jsdom has no showModal/close; mirror the open attribute.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

beforeEach(() => {
  lib.local = [stew, salad, branch];
  lib.cloud = { ...lib.cloud, recipes: [], isLoading: false, cloudError: false, hasMore: false, loadingMore: false, loadMoreError: false, retryCloud: vi.fn() };
});

describe('SearchPage', () => {
  it('focuses the input and lists originals for an empty query', () => {
    render();
    expect(screen.getByRole('searchbox', { name: 'Search recipes, or describe a dish' })).toHaveFocus();
    expect(rowNames()).toEqual(['Bean Stew', 'Quick Salad']);
    expect(screen.getByText('Searching recipes on this device and the 0 newest shared recipes.')).toBeInTheDocument();
  });

  it('filters by title and by ingredient, and keeps q in the URL', () => {
    render();
    type('salad');
    expect(rowNames()).toEqual(['Quick Salad']);
    type('walnut');
    expect(rowNames()).toEqual(['Bean Stew']);
    expect(probe()).toContain('/search?q=walnut');
  });

  it('reads the query from the URL on open', () => {
    render('/search?q=walnut');
    expect(rowNames()).toEqual(['Bean Stew']);
  });

  it('shows a branch with its family label and its prompt', () => {
    render();
    type('stew');
    expect(rowNames()).toEqual(['Spicy Bean Stew', 'Bean Stew']);
    expect(screen.getByText('Bean Stew variation')).toBeInTheDocument();
    expect(screen.getByText('"make it spicy"')).toBeInTheDocument();
  });

  it('searches the loaded cloud rows after the device rows', () => {
    lib.cloud.recipes = [makeRecipe({ id: 'c1', title: 'Cloud Curry', createdAt: 1 })];
    render();
    type('curry');
    expect(rowNames()).toEqual(['Cloud Curry']);
    expect(screen.getByText('Searching recipes on this device and the 1 newest shared recipe.')).toBeInTheDocument();
  });

  it.each([
    ['Under 30 min', 'under30', ['Quick Salad']],
    ['Easy', 'easy', ['Quick Salad']],
    ['Branches', 'branches', ['Spicy Bean Stew']],
  ])('the %s chip filters and lives in f', (label, f, rows) => {
    render();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(rowNames()).toEqual(rows);
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    expect(probe()).toContain(`?f=${f}`);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(rowNames()).toEqual(['Bean Stew', 'Quick Salad']);
    expect(probe()).toMatch(/^\/search\|/);
  });

  it('keeps q and f together, and restores both from the URL', () => {
    render('/search?q=stew&f=branches');
    expect(rowNames()).toEqual(['Spicy Bean Stew']);
    expect(screen.getByRole('button', { name: 'Branches' })).toHaveAttribute('aria-pressed', 'true');
    type('spicy');
    expect(probe()).toContain('/search?q=spicy&f=branches');
  });

  it('shows the empty card and Write it opens the chat with the query, unsent', () => {
    render();
    type('  pumpkin pie ');
    expect(screen.getByText('Nothing called "pumpkin pie" yet')).toBeInTheDocument();
    expect(screen.getByText('Write it now and it becomes the first of its family.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Write "pumpkin pie"' }));
    expect(probe()).toBe('/create|{"suggestion":"pumpkin pie"}');
  });

  it('the pill Write it is disabled until there is a query, then navigates with it', () => {
    render();
    expect(screen.getByRole('button', { name: 'Write it' })).toBeDisabled();
    type('stew');
    fireEvent.click(screen.getByRole('button', { name: 'Write it' }));
    expect(probe()).toBe('/create|{"suggestion":"stew"}');
  });

  it('hides both Write it buttons in local-only mode', () => {
    render('/search', true);
    expect(screen.getByText('Searching recipes on this device.')).toBeInTheDocument();
    type('pumpkin');
    expect(screen.getByText('Nothing called "pumpkin" here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Write/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Write it now and it becomes the first of its family.')).not.toBeInTheDocument();
  });

  it('shows device rows and Try again when the shared library fails', () => {
    lib.cloud.cloudError = true;
    render();
    expect(rowNames()).toEqual(['Bean Stew', 'Quick Salad']);
    expect(screen.getByText("Shared recipes couldn't load.")).toBeInTheDocument();
    expect(screen.queryByText(/^Searching recipes/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(lib.cloud.retryCloud).toHaveBeenCalled();
  });

  it('shows skeletons while the device read runs', () => {
    lib.local = undefined;
    render();
    expect(screen.getByRole('status', { name: 'Loading recipes' })).toBeInTheDocument();
  });

  it('says what to type with nothing to list', () => {
    lib.local = [];
    render();
    expect(screen.getByText('Type a dish or an ingredient.')).toBeInTheDocument();
  });

  it('announces the scope and the result count in one live region', () => {
    render();
    expect(live()).toHaveTextContent('Searching recipes on this device and the 0 newest shared recipes.');
    expect(live()).toHaveTextContent('2 results');
    type('walnut');
    expect(live()).toHaveTextContent('1 result');
    type('zzz');
    expect(live()).toHaveTextContent('Nothing called "zzz" here');
  });

  it('keeps the live region mounted while loading', () => {
    lib.local = undefined;
    render();
    expect(live()).toBeInTheDocument();
  });

  it('Back returns to the previous page when there is history', () => {
    render('/start');
    fireEvent.click(screen.getByRole('link', { name: 'Go to search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(probe()).toMatch(/^\/start\|/);
  });

  it('Back goes to Explore on a direct visit', () => {
    render('/search?q=stew');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(probe()).toMatch(/^\/\|/);
  });

  it('names the chip group', () => {
    render();
    const group = screen.getByRole('group', { name: 'Filter results' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pantry', 'All', 'Under 30 min', 'Easy', 'Branches']);
  });

  it('disables Load more while a page loads', () => {
    lib.cloud.hasMore = true;
    lib.cloud.loadingMore = true;
    render();
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('says when Load more failed', () => {
    lib.cloud.hasMore = true;
    lib.cloud.loadMoreError = true;
    render();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more recipes. Try again.');
    expect(screen.getByRole('button', { name: 'Search more shared recipes' })).toBeEnabled();
  });

  it('offers Search more shared recipes under the empty card while more pages exist', () => {
    lib.cloud.hasMore = true;
    lib.cloud.loadMore = vi.fn(async () => {});
    render();
    type('pumpkin');
    expect(screen.getByText('Nothing called "pumpkin" yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search more shared recipes' }));
    expect(lib.cloud.loadMore).toHaveBeenCalled();
  });

  describe('Pantry', () => {
    const omelette = makeRecipe({ id: 'om', title: 'Omelette', totalTime: 20, ingredients: [makeIngredient('Eggs'), makeIngredient('feta')], createdAt: 5 });
    const frittata = makeRecipe({ id: 'fr', title: 'Frittata', totalTime: 50, ingredients: [makeIngredient('eggs'), makeIngredient('feta')], createdAt: 6 });
    const eggBranch = makeRecipe({ id: 'om-b', parentId: 'om', rootId: 'om', depth: 1, title: 'Egg Wrap', totalTime: 10, ingredients: [makeIngredient('eggs'), makeIngredient('feta')], createdAt: 7 });
    beforeEach(() => {
      lib.local = [stew, salad, branch, omelette, frittata, eggBranch];
    });
    const addItem = (name: string) => {
      const field = screen.queryByRole('textbox', { name: 'Add an ingredient' });
      if (!field) fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      const input = screen.getByRole('textbox', { name: 'Add an ingredient' });
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: 'Enter' });
    };
    const sheet = () => screen.getByRole('dialog', { name: 'What have you got?' });

    it('adds and removes items, and the Show button counts live', () => {
      render();
      fireEvent.click(screen.getByRole('button', { name: 'Pantry' }));
      addItem('eggs');
      expect(within(sheet()).getByRole('button', { name: 'Remove eggs' })).toBeInTheDocument();
      expect(within(sheet()).getByRole('button', { name: 'Show 3 recipes' })).toBeInTheDocument();
      fireEvent.change(screen.getByRole('textbox', { name: 'Add an ingredient' }), { target: { value: 'feta' } });
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Add an ingredient' }), { key: ',' });
      fireEvent.click(within(sheet()).getByRole('radio', { name: '30 min' }));
      expect(within(sheet()).getByRole('button', { name: 'Show 2 recipes' })).toBeInTheDocument();
      addItem('walnut');
      expect(within(sheet()).getByRole('button', { name: 'Show recipes' })).toBeInTheDocument();
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove walnut' }));
      fireEvent.click(within(sheet()).getByRole('radio', { name: '15 min' }));
      expect(within(sheet()).getByRole('button', { name: 'Show 1 recipe' })).toBeInTheDocument();
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Reset' }));
      expect(within(sheet()).queryByRole('button', { name: /^Remove/ })).toBeNull();
      expect(within(sheet()).getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
    });

    it('Show filters, writes the URL and the Using line, and keeps branches', () => {
      render('/search?q=stew');
      fireEvent.click(screen.getByRole('button', { name: 'Pantry' }));
      addItem('Eggs');
      addItem('feta');
      fireEvent.click(within(sheet()).getByRole('radio', { name: '30 min' }));
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Show 2 recipes' }));
      expect(rowNames()).toEqual(['Egg Wrap', 'Omelette']);
      expect(probe()).toContain('?p=eggs%2Cfeta&pt=30');
      expect(probe()).not.toContain('q=');
      expect(probe()).not.toContain('sheet');
      expect(screen.getByText('Using eggs, feta · under 30 min')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pantry, 2 ingredients' })).toHaveAttribute('aria-haspopup', 'dialog');
      expect(screen.getByRole('searchbox')).toHaveValue('');
    });

    it('restores the filter from ?p= on load and opens the sheet from ?sheet=pantry', () => {
      render('/search?p=eggs&pt=15&sheet=pantry');
      expect(rowNames()).toEqual(['Egg Wrap']);
      expect(screen.getByText('Using eggs · under 15 min')).toBeInTheDocument();
      expect(within(sheet()).getByRole('button', { name: 'Remove eggs' })).toBeInTheDocument();
      expect(within(sheet()).getByRole('radio', { name: '15 min' })).toHaveAttribute('aria-checked', 'true');
    });

    it('starts focus on the first chip, Escape closes and the URL drops sheet', async () => {
      render('/search?p=eggs&sheet=pantry');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove eggs' })).toHaveFocus());
      fireEvent(sheet(), new Event('cancel', { cancelable: true }));
      expect(probe()).not.toContain('sheet');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Escape in the Add field cancels it, empty Enter adds nothing', async () => {
      render('/search?sheet=pantry');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus());
      addItem('');
      expect(within(sheet()).queryByRole('button', { name: /^Remove/ })).toBeNull();
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Add an ingredient' }), { key: 'Escape' });
      expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('write-a-new-one opens the chat with the built prompt, unsent', () => {
      render('/search?sheet=pantry');
      addItem('eggs');
      addItem('feta');
      fireEvent.click(within(sheet()).getByRole('radio', { name: '30 min' }));
      fireEvent.click(within(sheet()).getByRole('button', { name: 'Or write a new one with these' }));
      expect(probe()).toBe('/create|{"suggestion":"Something with eggs and feta in under 30 minutes"}');
    });

    it('Back closes the sheet it pushed, and Show with no items is disabled', () => {
      render();
      fireEvent.click(screen.getByRole('button', { name: 'Pantry' }));
      expect(probe()).toContain('sheet=pantry');
      expect(within(sheet()).getByRole('button', { name: 'Add an ingredient' })).toBeDisabled();
      fireEvent.click(within(sheet()).getByRole('radio', { name: '30 min' }));
      expect(within(sheet()).getByRole('button', { name: 'Add an ingredient' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'history back' }));
      expect(probe()).not.toContain('sheet');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('splits a pasted draft on commas', () => {
      render('/search?sheet=pantry');
      addItem('eggs, feta');
      expect(within(sheet()).getByRole('button', { name: 'Remove feta' })).toBeInTheDocument();
    });

    it('typing a query clears the pantry filter', () => {
      render('/search?p=eggs&pt=30');
      type('stew');
      expect(rowNames()).toEqual(['Spicy Bean Stew', 'Bean Stew']);
      expect(probe()).toContain('?q=stew');
      expect(probe()).not.toContain('p=');
    });

    it('local-only mode hides the write action', () => {
      render('/search?sheet=pantry', true);
      expect(within(sheet()).queryByRole('button', { name: 'Or write a new one with these' })).toBeNull();
    });
  });
});
