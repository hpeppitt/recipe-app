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
const { getPublishedRecipe, publishRecipe, firebase } = vi.hoisted(() => ({
  getPublishedRecipe: vi.fn(),
  publishRecipe: vi.fn(),
  firebase: { isFirebaseConfigured: true },
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
}));

import { RecipeEditPage } from './RecipeEditPage';

const anon: AppUser = { uid: fakeUser.uid, displayName: 'Waffle', email: null, isAnonymous: true, emailVerified: false };

function Saved() {
  const { state } = useLocation();
  return <p>saved:{(state as { saved: string }).saved}</p>;
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
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

const CONNECTION = "Couldn't save your changes. Check your connection and try again.";

beforeEach(async () => {
  vi.clearAllMocks();
  firebase.isFirebaseConfigured = true;
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
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
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
    expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a missing cloud copy writes nothing and offers no retry', async () => {
    getPublishedRecipe.mockResolvedValue(null);
    renderEdit();

    editTitleAndSave('Stew');

    expect((await screen.findByRole('alert')).textContent).toBe('This recipe is no longer in your account.');
    expect(publishRecipe).not.toHaveBeenCalled();
    expect((await db.recipes.get('r1'))?.title).toBe('Soup');
    expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(true);
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
