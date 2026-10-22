// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeIngredient, makeRecipe } from '../test/factories';
import { db } from '../db/database';
import type { AppUser, Recipe } from '../types/recipe';

const recipe = makeRecipe({
  id: 'r1',
  title: 'Soup',
  updatedAt: 1,
  ingredients: [makeIngredient('water')],
  instructions: [{ step: 1, text: 'Boil.', group: null }],
  createdBy: { uid: fakeUser.uid, displayName: fakeUser.displayName },
});
const { getPublishedRecipe, publishRecipe, firebase, lineage } = vi.hoisted(() => ({
  getPublishedRecipe: vi.fn(),
  publishRecipe: vi.fn(),
  firebase: { isFirebaseConfigured: true },
  lineage: { children: [] as { id: string }[], isLoading: false },
}));

vi.mock('../services/firestore', () => ({
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
}));
vi.mock('../services/firebase', () => ({
  get isFirebaseConfigured() {
    return firebase.isFirebaseConfigured;
  },
}));
vi.mock('../services/analytics', () => ({ trackRecipeUpdated: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../hooks/useRecipe', () => ({
  useRecipe: () => ({ recipe, source: 'local', isLoading: false, cloudError: false, retry: () => {} }),
  useRecipeLineage: () => ({ ...lineage, ancestors: [], descendantCount: 0, recipes: [] }),
}));

import { RecipeEditPage } from './RecipeEditPage';

const anon: AppUser = { uid: fakeUser.uid, displayName: 'Waffle', email: null, isAnonymous: true, emailVerified: false, providers: [] };

function Saved() {
  const { state } = useLocation();
  return <p>saved:{(state as { saved?: string } | null)?.saved ?? 'none'}</p>;
}

function renderEdit(user?: AppUser | null) {
  renderWithProviders(
    <Routes>
      <Route path="/recipe/:id/edit" element={<RecipeEditPage />} />
      <Route path="/recipe/:id" element={<Saved />} />
    </Routes>,
    { route: '/recipe/r1/edit', ...(user !== undefined && { user }) }
  );
}

function editTitleAndSave(title: string) {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
}

const CONNECTION = "Couldn't save your changes. Check your connection and try again.";

beforeEach(async () => {
  vi.clearAllMocks();
  firebase.isFirebaseConfigured = true;
  lineage.children = [];
  lineage.isLoading = false;
  await db.recipes.clear();
  await db.recipes.put(recipe);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('RecipeEditPage save (verified owner, cloud first)', () => {
  it('publishes the edit before writing Dexie, with one updatedAt, then navigates as cloud', async () => {
    getPublishedRecipe.mockResolvedValue({ id: 'r1' });
    let dexieTitleAtPublish: string | undefined;
    publishRecipe.mockImplementation(async () => {
      dexieTitleAtPublish = (await db.recipes.get('r1'))?.title;
    });
    renderEdit();

    editTitleAndSave('Stew');

    expect(await screen.findByText('saved:cloud')).toBeTruthy();
    expect(dexieTitleAtPublish).toBe('Soup');
    const sent = publishRecipe.mock.calls[0][0] as Recipe;
    expect(sent.title).toBe('Stew');
    expect(sent.updatedAt).toBeGreaterThan(1);
    const stored = await db.recipes.get('r1');
    expect(stored?.title).toBe('Stew');
    expect(stored?.updatedAt).toBe(sent.updatedAt);
  });

  it('a failed publish leaves Dexie unchanged, keeps the draft and lets Save run again', async () => {
    getPublishedRecipe.mockResolvedValue({ id: 'r1' });
    publishRecipe.mockRejectedValueOnce(new Error('offline'));
    renderEdit();

    editTitleAndSave('Stew');

    expect((await screen.findByRole('alert')).textContent).toBe(CONNECTION);
    expect((await db.recipes.get('r1'))?.title).toBe('Soup');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Stew');

    publishRecipe.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('saved:cloud')).toBeTruthy();
    expect((await db.recipes.get('r1'))?.title).toBe('Stew');
  });

  it('a failed cloud check writes nothing and shows the connection error', async () => {
    getPublishedRecipe.mockRejectedValue(new Error('offline'));
    renderEdit();

    editTitleAndSave('Stew');

    expect((await screen.findByRole('alert')).textContent).toBe(CONNECTION);
    expect(publishRecipe).not.toHaveBeenCalled();
    expect((await db.recipes.get('r1'))?.title).toBe('Soup');
  });

  it('a cloud write that never settles times out at 5 seconds with nothing written', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getPublishedRecipe.mockReturnValue(new Promise(() => {}));
    renderEdit();

    editTitleAndSave('Stew');
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(CONNECTION));
    expect((await db.recipes.get('r1'))?.title).toBe('Soup');
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a missing cloud copy writes nothing and offers no retry', async () => {
    getPublishedRecipe.mockResolvedValue(null);
    renderEdit();

    editTitleAndSave('Stew');

    expect((await screen.findByRole('alert')).textContent).toBe('This recipe is no longer in your account.');
    expect(publishRecipe).not.toHaveBeenCalled();
    expect((await db.recipes.get('r1'))?.title).toBe('Soup');
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('RecipeEditPage emoji field', () => {
  it('a second emoji replaces the first', () => {
    renderEdit();
    const input = screen.getByLabelText('Emoji') as HTMLInputElement;
    fireEvent.change(input, { target: { value: `${input.value}🧈` } });
    expect(input.value).toBe('🧈');
  });

  it('an emoji inserted before the existing one wins', () => {
    renderEdit();
    const input = screen.getByLabelText('Emoji') as HTMLInputElement;
    fireEvent.change(input, { target: { value: `🧈${input.value}` } });
    expect(input.value).toBe('🧈');
  });

  it('shows one emoji for an old multi-emoji recipe and the previous one when emptied', () => {
    renderEdit();
    const input = screen.getByLabelText('Emoji') as HTMLInputElement;
    const before = input.value;
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(screen.getByText('Leave empty to keep the current emoji.')).toBeTruthy();
    expect(before).not.toBe('');
  });

  it('does not normalise while composing, then does on compositionend', () => {
    renderEdit();
    const input = screen.getByLabelText('Emoji') as HTMLInputElement;
    const before = input.value;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: `${before}sm` } });
    fireEvent.compositionEnd(input);
    expect(input.value).toBe(before);
  });
});

describe('RecipeEditPage save (Dexie only)', () => {
  it('local-only mode writes Dexie and never touches the cloud', async () => {
    firebase.isFirebaseConfigured = false;
    renderEdit();

    editTitleAndSave('Stew');

    expect(await screen.findByText('saved:cloud')).toBeTruthy();
    expect((await db.recipes.get('r1'))?.title).toBe('Stew');
    expect(getPublishedRecipe).not.toHaveBeenCalled();
    expect(publishRecipe).not.toHaveBeenCalled();
  });

  it('an unverified owner writes Dexie and never touches the cloud', async () => {
    renderEdit(anon);

    editTitleAndSave('Stew');

    await screen.findByText('saved:cloud');
    expect((await db.recipes.get('r1'))?.title).toBe('Stew');
    expect(getPublishedRecipe).not.toHaveBeenCalled();
  });
});

describe('RecipeEditPage layout and guard', () => {
  const NOTE_ONE = '1 branch below this keeps its own copy.';

  // jsdom has no <dialog> modal API; ConfirmDialog needs showModal and close.
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  it('shows no branch note when the recipe has no children', () => {
    renderEdit();
    expect(screen.queryByText(/below this keep/)).toBeNull();
  });

  it('says "1 branch below this keeps its own copy." for one direct child', () => {
    lineage.children = [{ id: 'c1' }];
    renderEdit();
    expect(screen.getByText(NOTE_ONE)).toBeTruthy();
  });

  it('says "<n> branches below this keep their own copy." for several', () => {
    lineage.children = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    renderEdit();
    expect(screen.getByText('3 branches below this keep their own copy.')).toBeTruthy();
    expect(screen.queryByText(NOTE_ONE)).toBeNull();
  });

  it('shows no note while the lineage is still loading', () => {
    lineage.children = [{ id: 'c1' }];
    lineage.isLoading = true;
    renderEdit();
    expect(screen.queryByText(/below this keep/)).toBeNull();
  });

  it('has one Cancel, in the header, and Save is named "Save changes"', () => {
    renderEdit();
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Editing' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Stew' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('header Cancel with changes asks to discard and stays on the form until Discard', async () => {
    renderEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Stew' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    expect(screen.queryByText(/^saved:/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('saved:none')).toBeTruthy();
  });

  it('header Cancel without changes leaves at once', async () => {
    renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('saved:none')).toBeTruthy();
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('the emoji blob button focuses the emoji input', () => {
    renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Change emoji' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Emoji'));
  });

  it('a failed Save moves focus to the first invalid field and scrolls it into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      // Selects cannot produce a bad value, so a bad stored value is the way in.
      recipe.servings = 0;
      renderEdit();
      fireEvent.change(screen.getByLabelText('Ingredient 1 amount'), { target: { value: '-2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      // Servings comes before ingredients on the page, so it wins.
      expect(document.activeElement).toBe(screen.getByLabelText('Servings'));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(screen.getByLabelText('Servings'));
      // Focus lands before the re-render adds aria-describedby, so the message must be an alert.
      expect(screen.getAllByRole('alert').map((n) => n.textContent)).toContain('Must serve at least one.');

      fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      const amount = screen.getByLabelText('Ingredient 1 amount');
      expect(document.activeElement).toBe(amount);
      expect(amount.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('alert').textContent).toBe("Amounts can't be negative.");
      expect(publishRecipe).not.toHaveBeenCalled();
    } finally {
      recipe.servings = 2;
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('a blank title is attached to the Title field and takes focus', () => {
    renderEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const title = screen.getByLabelText('Title');
    expect(document.activeElement).toBe(title);
    expect(screen.getByRole('alert').textContent).toBe('A recipe needs a title.');
    expect(document.getElementById(title.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'A recipe needs a title.'
    );
  });

  it('names each remove button for its ingredient', () => {
    renderEdit();
    expect(screen.getByRole('button', { name: 'Remove ingredient 1, water' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(screen.getByRole('button', { name: 'Remove ingredient 2' })).toBeTruthy();
  });

  it('marks only the offending ingredient inputs invalid', () => {
    renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.change(screen.getByLabelText('Ingredient 2 name'), { target: { value: 'salt' } });
    fireEvent.change(screen.getByLabelText('Ingredient 2 amount'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Ingredient 3 name'), { target: { value: 'oil' } });
    fireEvent.change(screen.getByLabelText('Ingredient 3 amount'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByLabelText('Ingredient 3 amount').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Ingredient 3 amount').getAttribute('aria-describedby')).toBe('edit-ingredients-error');
    for (const label of ['Ingredient 1 amount', 'Ingredient 2 amount', 'Ingredient 1 name', 'Ingredient 2 name', 'Ingredient 3 name']) {
      expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBeNull();
      expect(screen.getByLabelText(label).getAttribute('aria-describedby')).toBeNull();
    }
  });

  it('marks and focuses the unnamed row, not a row with only a bad amount elsewhere', () => {
    renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.change(screen.getByLabelText('Ingredient 2 amount'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Ingredient 2 name'));
    expect(screen.getByLabelText('Ingredient 1 name').getAttribute('aria-invalid')).toBeNull();
  });

  it('does not move focus on a clean save or while typing', async () => {
    renderEdit(anon);
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Stew' } });
    expect(document.activeElement).toBe(document.body);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('saved:cloud');
    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses prep, cook, the first step and the empty-list add buttons', () => {
    const fail = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    recipe.prepTime = -1;
    recipe.cookTime = -1;
    renderEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Soup 2' } });
    fail();
    expect(document.activeElement).toBe(screen.getByLabelText('Prep'));
    fireEvent.change(screen.getByLabelText('Prep'), { target: { value: '5' } });
    fail();
    expect(document.activeElement).toBe(screen.getByLabelText('Cook'));
    fireEvent.change(screen.getByLabelText('Cook'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: ' ' } });
    fail();
    expect(document.activeElement).toBe(screen.getByLabelText('Step 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    fail();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove ingredient 1, water' }));
    fail();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add ingredient' }));
    recipe.prepTime = 10;
    recipe.cookTime = 20;
  });
});

describe('RecipeEditPage fact pickers', () => {
  it('each select writes its draft field and saves the parsed value', async () => {
    renderEdit(anon);
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Prep'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Cook'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'hard' } });
    expect((screen.getByLabelText('Cook') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Cook 1h 30m');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('saved:cloud');
    const stored = await db.recipes.get('r1');
    expect([stored?.servings, stored?.prepTime, stored?.cookTime, stored?.totalTime, stored?.difficulty]).toEqual([8, 15, 90, 105, 'hard']);
  });

  it('shows a negative stored time raw, not as a formatted time', () => {
    recipe.prepTime = -1;
    try {
      renderEdit();
      expect((screen.getByLabelText('Prep') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Prep -1');
    } finally {
      recipe.prepTime = 10;
    }
  });

  it('keeps an off-list value as a selected extra option', () => {
    recipe.prepTime = 37;
    recipe.servings = 30;
    try {
      renderEdit();
      const prep = screen.getByLabelText('Prep') as HTMLSelectElement;
      const servings = screen.getByLabelText('Servings') as HTMLSelectElement;
      expect(prep.value).toBe('37');
      expect(servings.value).toBe('30');
      expect(prep.selectedOptions[0].textContent).toBe('Prep 37 min');
    } finally {
      recipe.prepTime = 10;
      recipe.servings = 2;
    }
  });

  describe('reordering and the method toggle', () => {
    const originalIngredients = recipe.ingredients;
    const originalInstructions = recipe.instructions;
    beforeEach(() => {
      recipe.ingredients = [makeIngredient('water'), makeIngredient('salt'), makeIngredient('leek')];
    });
    afterEach(() => {
      recipe.ingredients = originalIngredients;
      recipe.instructions = originalInstructions;
    });

    it('moves an ingredient with the arrow keys, keeps focus, announces it and saves the new order', async () => {
      getPublishedRecipe.mockResolvedValue({ id: 'r1' });
      renderEdit();
      const handle = screen.getByRole('button', { name: 'Move ingredient 1, water' });
      expect(handle.getAttribute('aria-describedby')).toBe('ingredient-move-hint');
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(screen.getByLabelText('Ingredient 2 name')).toHaveProperty('value', 'water');
      expect(document.activeElement).toBe(handle);
      expect(screen.getByRole('status').textContent).toMatch(/^water moved to position 2 of 3/);
      // The top row cannot move up.
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move ingredient 1, salt' }), { key: 'ArrowUp' });
      expect(screen.getByLabelText('Ingredient 1 name')).toHaveProperty('value', 'salt');
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText('saved:cloud');
      expect((publishRecipe.mock.calls[0][0] as Recipe).ingredients.map((i) => i.name)).toEqual(['salt', 'water', 'leek']);
    });

    it('says so at the edges and keeps rows and keys together across consecutive moves', () => {
      renderEdit();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move ingredient 1, water' }), { key: 'ArrowUp' });
      expect(screen.getByRole('status').textContent).toMatch(/^water is already first/);
      fireEvent.change(screen.getByLabelText('Ingredient 1 notes'), { target: { value: 'cold' } });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move ingredient 1, water' }), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move ingredient 2, water' }), { key: 'ArrowDown' });
      expect(screen.getByLabelText('Ingredient 3 name')).toHaveProperty('value', 'water');
      expect(screen.getByLabelText('Ingredient 3 notes')).toHaveProperty('value', 'cold');
    });

    it('collapses the method by default and toggles it', () => {
      renderEdit();
      const toggle = screen.getByRole('button', { name: /Method/ });
      expect(toggle.textContent).toContain('1 step');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.getByLabelText('Step 1').closest('#edit-method')?.hasAttribute('hidden')).toBe(true);
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByLabelText('Step 1').closest('#edit-method')?.hasAttribute('hidden')).toBe(false);
    });

    it('opens the method when validation flags the steps', () => {
      renderEdit();
      fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: ' ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(screen.getByRole('button', { name: /Method/ }).getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(screen.getByLabelText('Step 1'));
    });
  });
});
