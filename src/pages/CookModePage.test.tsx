// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeIngredient, makeRecipe } from '../test/factories';
import type { AppUser } from '../types/recipe';

let recipe: ReturnType<typeof makeRecipe> | null = null;
let source: 'local' | 'cloud' = 'cloud';
const navigateSpy = vi.fn();
const getPublishedRecipe = vi.fn();

vi.mock('../hooks/useRecipe', () => ({
  useRecipe: () => ({ recipe, source, isLoading: false, cloudError: false, retry: () => {} }),
}));
vi.mock('../hooks/useCooks', () => ({
  useRecipeCooks: () => ({ status: 'ready', summary: null, refresh: () => {}, log: () => Promise.resolve('c1') }),
}));
vi.mock('../services/firestore', () => ({ getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock('../components/recipe/CookedSheet', () => ({
  CookedSheet: ({ open, onSaved }: { open: boolean; onSaved?: (id: string) => void }) =>
    open ? (
      <div role="dialog" aria-label="Cooked sheet">
        <button onClick={() => onSaved?.('c1')}>Save cook</button>
      </div>
    ) : null,
}));

import { CookModePage } from './CookModePage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  vi.clearAllMocks();
  source = 'cloud';
  getPublishedRecipe.mockResolvedValue(null);
  recipe = makeRecipe({
    id: 'r1',
    servings: 2,
    ingredients: [{ ...makeIngredient('flour'), amount: 100, unit: 'g' }],
    instructions: [1, 2, 3].map((step) => ({ step, text: `Do ${step}`, group: null })),
  });
});

function show(user: AppUser | null = fakeUser, state: unknown = { servings: 4 }) {
  renderWithProviders(
    <Routes>
      <Route path="/recipe/:id/cook" element={<CookModePage />} />
    </Routes>,
    { route: { pathname: '/recipe/r1/cook', state }, user }
  );
}
const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Next step|Done)$/ }));

describe('CookModePage (RL-203)', () => {
  it('moves through the steps with the buttons, arrow keys and swipes', () => {
    show();
    expect(screen.getByText('Step 1 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    expect(screen.getByText('Do 1').closest('[aria-live="polite"]')).not.toBeNull();
    const backBtn = screen.getByRole('button', { name: 'Back' });
    expect(backBtn).toHaveAttribute('aria-disabled', 'true');
    expect(backBtn).not.toBeDisabled();
    fireEvent.click(backBtn);
    expect(screen.getByText('Step 1 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    next();
    expect(backBtn).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByText('Do 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Step 3 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Step 2 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    const region = screen.getByText('Do 2').closest('[aria-live="polite"]')!;
    fireEvent.touchStart(region, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 100, clientY: 110 }] });
    expect(screen.getByText('Step 3 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    fireEvent.touchStart(region, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 300, clientY: 100 }] });
    expect(screen.getByText('Step 2 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
    // A swipe from the screen edge is the system's back gesture.
    fireEvent.touchStart(region, { touches: [{ clientX: 10, clientY: 100 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    expect(screen.getByText('Step 2 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
  });

  it('ignores arrow keys with a modifier held', () => {
    show();
    for (const mod of ['altKey', 'metaKey', 'ctrlKey', 'shiftKey']) fireEvent.keyDown(window, { key: 'ArrowRight', [mod]: true });
    expect(screen.getByText('Step 1 of 3', { selector: 'p:not(.sr-only)' })).toBeInTheDocument();
  });

  it('announces the step inside the live region, focuses it on open, and scrolls each new step to the top', () => {
    show();
    const live = screen.getByText('Do 1').closest('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveFocus();
    expect(live).toHaveTextContent('Step 1 of 3');
    const scroller = live.parentElement!;
    scroller.scrollTop = 300;
    next();
    expect(scroller.scrollTop).toBe(0);
  });

  it('on the last step, Done opens the cook sheet and saving returns to the recipe', () => {
    show();
    next();
    next();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Save cook' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1', { replace: true, state: { cooked: true } });
  });

  it('Done opens the sign-in sheet for a signed-out cook', () => {
    show(null);
    next();
    next();
    next();
    expect(screen.getByRole('heading', { name: 'Sign in to log a cook' })).toBeInTheDocument();
  });

  it('Done on an unpublished recipe just goes back to it', async () => {
    source = 'local';
    show();
    await waitFor(() => expect(getPublishedRecipe).toHaveBeenCalled());
    next();
    next();
    next();
    expect(screen.queryByRole('dialog', { name: 'Cooked sheet' })).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it('scales the ingredients to the servings passed in, behind a closed toggle', () => {
    show();
    const toggle = screen.getByRole('button', { name: 'Ingredients' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('200 g')).not.toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText('200 g')).toBeVisible();
    expect(screen.getByText('For 4')).toBeInTheDocument();
  });

  it('defaults to the stored servings, and Close replaces with the recipe on a direct visit', () => {
    show(fakeUser, null);
    fireEvent.click(screen.getByRole('button', { name: 'Ingredients' }));
    expect(screen.getByText('100 g')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close cook mode' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1', { replace: true });
  });

  it('says the screen may dim when wake lock is unavailable', () => {
    show();
    expect(screen.getByText('Your screen may still dim.')).toBeInTheDocument();
  });
});
