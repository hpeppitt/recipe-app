// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { db } from '../db/database';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeIngredient, makeRecipe } from '../test/factories';
import { IMPORT_ERROR_MESSAGE, type ImportDraft } from '../lib/linkImport';
import type { Recipe } from '../types/recipe';

const { publishRecipe, importRecipeFromUrl, importRecipeFromPhotos, getAllPublishedRecipes, downscaleToJpeg, trackRecipeCreated, reportError } = vi.hoisted(() => ({
  importRecipeFromPhotos: vi.fn(),
  downscaleToJpeg: vi.fn(),
  trackRecipeCreated: vi.fn(),
  reportError: vi.fn(),
  publishRecipe: vi.fn(),
  importRecipeFromUrl: vi.fn(),
  getAllPublishedRecipes: vi.fn(),
}));
vi.mock('../services/firestore', () => ({
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  notifyBranched: vi.fn(),
  getAllPublishedRecipes: (...a: unknown[]) => getAllPublishedRecipes(...a),
  searchPublishedVariations: vi.fn(),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/gemini', () => ({
  createRecipeChat: vi.fn(),
  createVariationChat: vi.fn(),
  importRecipeFromUrl: (...a: unknown[]) => importRecipeFromUrl(...a),
  importRecipeFromPhotos: (...a: unknown[]) => importRecipeFromPhotos(...a),
}));
vi.mock('../services/imageDownscale', () => ({ downscaleToJpeg: (...a: unknown[]) => downscaleToJpeg(...a) }));
vi.mock('../services/analytics', () => ({ trackRecipeCreated: (...a: unknown[]) => trackRecipeCreated(...a) }));
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('../components/auth/EmailLinkingForm', () => ({ EmailLinkingForm: () => <form aria-label="Sign up" /> }));

import { ImportPage } from './ImportPage';
import { clearPublishedWindow } from '../services/publishedWindow';

const PAGE = 'https://www.seriouseats.com/chicken-stew';

function draftOf(title: string, uncertain = 0): ImportDraft {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } = makeRecipe({
    title,
    totalTime: 35,
    ingredients: [makeIngredient('chicken'), makeIngredient('salt'), makeIngredient('stock')].map((i, n) =>
      n < uncertain ? { ...i, amount: null, uncertain: true } : i
    ),
    instructions: [1, 2].map((step) => ({ step, text: `Step ${step}`, group: null })),
  });
  return { recipe: { ...rest, importedFrom: PAGE }, uncertainCount: uncertain, error: null };
}

function Probe() {
  const { pathname, state } = useLocation();
  return <output data-testid="probe">{`${pathname}|${JSON.stringify(state)}`}</output>;
}

const render = (user = fakeUser, route = '/import') =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/import" element={<ImportPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Probe />
    </>,
    { route, user }
  );

const field = () => screen.getByRole('textbox', { name: 'Recipe link' }) as HTMLInputElement;
const readLink = (url = PAGE) => {
  fireEvent.change(field(), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
};
const probe = () => screen.getByTestId('probe').textContent;
const status = () => document.querySelector('p[role="status"]')!.textContent;

beforeEach(async () => {
  vi.clearAllMocks();
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  clearPublishedWindow();
  getAllPublishedRecipes.mockResolvedValue([]);
  publishRecipe.mockResolvedValue(undefined);
  importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew'));
  await db.recipes.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ImportPage', () => {
  it('shows the sign-up gate instead of the link field to a user without a verified email', () => {
    render({ ...fakeUser, emailVerified: false });
    expect(screen.getByText('Sign up to add recipes from links')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Recipe link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('shows the error under the field and keeps what was typed for a link it refuses', async () => {
    render();
    readLink('localhost/stew');
    expect((await screen.findByRole('alert')).textContent).toBe(IMPORT_ERROR_MESSAGE);
    expect(field().value).toBe('localhost/stew');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(importRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('reads a pasted link straight away when the field was empty, and focuses the preview', async () => {
    render();
    fireEvent.paste(field(), { clipboardData: { getData: () => PAGE } });
    expect(field().value).toBe(PAGE);
    expect(status()).toBe('Reading the page…');
    expect(field().readOnly).toBe(true);
    expect(field().disabled).toBe(false);
    await screen.findByRole('region', { name: 'Check the import' });
    expect(importRecipeFromUrl).toHaveBeenCalledWith(PAGE);
    expect(status()).toBe('Read Chicken Stew, 3 ingredients');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Check the import' }));
  });

  it('editing the link after a read clears the preview', async () => {
    render();
    readLink();
    await screen.findByRole('region', { name: 'Check the import' });
    fireEvent.change(field(), { target: { value: `${PAGE}x` } });
    expect(screen.queryByRole('region', { name: 'Check the import' })).toBeNull();
  });

  it('shows a spinner, not the form, while auth is loading', () => {
    renderWithProviders(<ImportPage />, { route: '/import', auth: { isLoading: true } });
    expect(screen.queryByRole('textbox', { name: 'Recipe link' })).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
  });

  it('shows the review with the source, editable title, rows, flags and summary', async () => {
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew', 2));
    render();
    readLink();
    const review = await screen.findByRole('region', { name: 'Check the import' });
    expect((screen.getByRole('textbox', { name: 'Recipe title' }) as HTMLInputElement).value).toBe('Chicken Stew');
    expect(review.textContent).toContain('seriouseats.com/chicken-stew');
    expect(review.textContent).toContain('Source kept');
    expect(review.textContent).toContain('3 ingredients, 2 steps read. 2 amounts were unclear.');
    expect(review.textContent!.match(/Check(?!\s*the)/g)).toHaveLength(2);
    expect((screen.getByRole('textbox', { name: 'Ingredient 1 amount' }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('textbox', { name: 'Ingredient 3 amount' }) as HTMLInputElement).value).toBe('1');
    expect(screen.queryByRole('region', { name: 'Already in the library' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit first' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save and branch' })).toBeTruthy();
  });

  it('says All amounts read clearly with no flags, and One amount for a single flag', async () => {
    render();
    readLink();
    expect((await screen.findByRole('region', { name: 'Check the import' })).textContent).toContain('All amounts read clearly.');
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew', 1));
    fireEvent.change(field(), { target: { value: `${PAGE}x` } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Check the import' }).textContent).toContain('One amount was unclear.'));
  });

  it('editing a flagged amount clears its flag and the summary', async () => {
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew', 1));
    render();
    readLink();
    const review = await screen.findByRole('region', { name: 'Check the import' });
    expect(review.textContent).toContain('One amount was unclear.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Ingredient 1 amount' }), { target: { value: '0.75' } });
    expect(review.textContent).toContain('All amounts read clearly.');
    // No flags left: Save and branch saves at once, with the typed amount and the edited title.
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipe title' }), { target: { value: 'Better Stew' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and branch' }));
    await waitFor(() => expect(publishRecipe).toHaveBeenCalled());
    const saved = publishRecipe.mock.calls[0][0] as Recipe;
    expect(saved.title).toBe('Better Stew');
    expect(saved.ingredients[0].amount).toBe(0.75);
    expect('uncertain' in saved.ingredients[0]).toBe(false);
  });

  it('with a flag left, asks first; Cancel saves nothing and Save keeps the amount null', async () => {
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew', 1));
    render();
    readLink();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit first' }));
    const dialog = await screen.findByRole('dialog', { hidden: true, name: /Save with/ });
    expect(dialog.textContent).toContain('Save with 1 unclear amount?');
    expect(dialog.textContent).toContain('It stays blank until you fill it in.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
    expect(publishRecipe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit first' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save', hidden: true }));
    await waitFor(() => expect(probe()).toMatch(/^\/recipe\/.+\/edit\|null$/));
    expect((publishRecipe.mock.calls[0][0] as Recipe).ingredients[0].amount).toBeNull();
  });

  it('refuses a typed amount that is not a number, keeping what was typed', async () => {
    render();
    readLink();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Ingredient 1 amount' }), { target: { value: '1/2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and branch' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Amounts must be numbers');
    expect((screen.getByRole('textbox', { name: 'Ingredient 1 amount' }) as HTMLInputElement).value).toBe('1/2');
    expect(publishRecipe).not.toHaveBeenCalled();
  });

  it('Save and branch saves a new original and opens the branch composer', async () => {
    render();
    readLink();
    fireEvent.click(await screen.findByRole('button', { name: 'Save and branch' }));
    await waitFor(() => expect(probe()).toMatch(/^\/recipe\/.+\/vary\|null$/));
    expect(publishRecipe.mock.calls[0][0]).toMatchObject({ parentId: null, depth: 0, importedFrom: PAGE });
  });

  it('offers Add to family first when the library has the same dish, and saves it as a branch', async () => {
    await db.recipes.add(makeRecipe({ id: 'root', title: 'Chicken Stew', createdBy: { uid: 'u2', displayName: 'Ana' } }));
    render();
    readLink();
    const notice = await screen.findByRole('region', { name: 'Already in the library' });
    expect(notice.textContent).toContain("There's already a Chicken Stew family with 1 version");
    expect(notice.textContent).toContain('Ana');

    fireEvent.click(screen.getByRole('button', { name: 'Add to Chicken Stew family' }));
    await waitFor(() => expect(probe()).toMatch(/^\/recipe\//));
    const saved = publishRecipe.mock.calls[0][0] as Recipe;
    expect(saved).toMatchObject({ parentId: 'root', rootId: 'root', depth: 1, prompt: 'Imported from seriouseats.com' });
    expect(probe()).toBe(`/recipe/${saved.id}|{"saved":"cloud","note":null}`);
  });

  it('Edit first beside a family match saves an original', async () => {
    await db.recipes.add(makeRecipe({ id: 'root', title: 'Chicken Stew' }));
    render();
    readLink();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit first' }));
    await waitFor(() => expect(publishRecipe).toHaveBeenCalled());
    expect(publishRecipe.mock.calls[0][0]).toMatchObject({ parentId: null, depth: 0, importedFrom: PAGE });
  });

  it('a failed save says Saving, then shows the chat error, refocuses the button, writes nothing and stays', async () => {
    let fail: (e: Error) => void = () => {};
    publishRecipe.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    render();
    readLink();
    const button = await screen.findByRole('button', { name: 'Edit first' });
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe('Saving…'));
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.parentElement!.parentElement!.getAttribute('aria-busy')).toBe('true');
    fail(new Error('offline'));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't save the recipe. Check your connection and try again."
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit first' }));
    expect(await db.recipes.count()).toBe(0);
    expect(probe()).toBe('/import|null');
  });
});

describe('ImportPage photo mode (RL-251)', () => {
  const B64 = 'J'.repeat(400);
  const file = (n: number) => new File(['x'], `p${n}.jpg`, { type: 'image/jpeg' });
  const pick = (...files: File[]) => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files } });
  const renderPhoto = (user = fakeUser) => render(user, '/import?mode=photo');
  const photoDraft = (): ImportDraft => {
    const d = draftOf('Gran Scones', 1);
    return { ...d, recipe: { ...d.recipe!, importedFrom: 'photo' } };
  };

  beforeEach(() => {
    let n = 0;
    downscaleToJpeg.mockImplementation(async () => ({ mimeType: 'image/jpeg', base64: `${B64}${n++}` }));
    importRecipeFromPhotos.mockResolvedValue(photoDraft());
  });

  it('drops the link preview when ?mode changes while mounted (RL-250)', async () => {
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew'));
    renderWithProviders(
      <>
        <Link to="/import?mode=photo">to photo</Link>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </>,
      { route: '/import' }
    );
    readLink();
    await screen.findByRole('region', { name: 'Check the import' });
    fireEvent.click(screen.getByText('to photo'));
    expect(screen.queryByRole('region', { name: 'Check the import' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Snap a page');
  });

  it('shows Snap a page with the photo picker instead of the link field', () => {
    renderPhoto();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Snap a page');
    expect(screen.queryByRole('textbox', { name: 'Recipe link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Read it' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('gates a user without a verified email with the photo wording', () => {
    renderPhoto({ ...fakeUser, emailVerified: false });
    expect(screen.getByText('Sign up to add recipes from photos')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add photos' })).toBeNull();
  });

  it('takes up to three photos with the Gemini notice, and refuses a fourth', async () => {
    renderPhoto();
    pick(file(1), file(2), file(3), file(4));
    await screen.findByAltText('Attached photo 3 of 3');
    expect(screen.getByText(/Photos are sent to Google's Gemini/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/3 photos/);
    expect((screen.getByRole('button', { name: 'Add another' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reads the photos into the preview with Photo and the unclear line, then saves with no photo anywhere', async () => {
    renderPhoto();
    pick(file(1), file(2));
    await screen.findByAltText('Attached photo 2 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    expect(status()).toBe('Reading the photos…');
    const card = await screen.findByRole('region', { name: 'Check the import' });
    expect(importRecipeFromPhotos).toHaveBeenCalledWith([
      { mimeType: 'image/jpeg', base64: `${B64}0` },
      { mimeType: 'image/jpeg', base64: `${B64}1` },
    ]);
    expect(card.textContent).toContain('Photo');
    expect(card.textContent).toContain('One amount was unclear.');
    expect(card.textContent).not.toContain('Source kept');

    fireEvent.click(screen.getByRole('button', { name: 'Save and branch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save', hidden: true }));
    await waitFor(() => expect(probe()).toMatch(/^\/recipe\/.+\/vary/));
    const saved = publishRecipe.mock.calls[0][0] as Recipe;
    expect(saved.prompt).toBe('Imported from a photo');
    expect(saved.importedFrom).toBe('photo');
    const stored = await db.recipes.get(saved.id);
    for (const value of [
      saved,
      stored,
      probe(),
      window.history.state,
      trackRecipeCreated.mock.calls,
      reportError.mock.calls,
    ]) {
      expect(JSON.stringify(value ?? null)).not.toContain(B64);
    }
  });

  it('shows a failed read in the alert line and keeps the photos for another try', async () => {
    importRecipeFromPhotos.mockResolvedValue({ recipe: null, uncertainCount: 0, error: 'Photo failed' });
    renderPhoto();
    pick(file(1));
    await screen.findByAltText('Attached photo 1 of 1');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Photo failed');
    expect(screen.getByAltText('Attached photo 1 of 1')).toBeTruthy();
  });

  it('removing a photo after a read clears the preview', async () => {
    renderPhoto();
    pick(file(1), file(2));
    await screen.findByAltText('Attached photo 2 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await screen.findByRole('region', { name: 'Check the import' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(screen.queryByRole('region', { name: 'Check the import' })).toBeNull();
  });
});

describe('ImportPage share target (RL-254, RL-264)', () => {
  const SHARE = `/import?title=Stew&text=${encodeURIComponent(`Look ${PAGE}.`)}`;
  const asking = () => document.querySelector('dialog[open]');
  const askTitle = 'Read this recipe from seriouseats.com?';
  const setOnline = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);

  it('asks first, and Read it reads the link once', async () => {
    render(fakeUser, SHARE);
    const dialog = (await screen.findByRole('dialog', { hidden: true, name: askTitle })) as HTMLElement;
    expect(asking()).toBe(dialog);
    expect(dialog.textContent).toContain(askTitle);
    expect(dialog.textContent).toContain("Recipe Lab reads the page with AI. You check the recipe before it's saved.");
    expect(importRecipeFromUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Read it', hidden: true }).find((b) => dialog.contains(b))!);
    await screen.findByRole('region', { name: 'Check the import' });
    expect(importRecipeFromUrl).toHaveBeenCalledTimes(1);
    expect(importRecipeFromUrl).toHaveBeenCalledWith(PAGE);
    expect(asking()).toBeNull();
  });

  it('Not now reads nothing, keeps the link and does not ask again', async () => {
    render(fakeUser, SHARE);
    await screen.findByRole('dialog', { hidden: true, name: askTitle });
    expect(asking()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Not now', hidden: true }));
    expect(importRecipeFromUrl).not.toHaveBeenCalled();
    expect(field().value).toBe(PAGE);
    expect(asking()).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('only prefills when offline', () => {
    setOnline(false);
    render(fakeUser, SHARE);
    expect(asking()).toBeNull();
    expect(field().value).toBe(PAGE);
    expect(importRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('shows the sign-up screen, no dialog, when not allowed to generate', () => {
    render({ ...fakeUser, emailVerified: false }, SHARE);
    expect(asking()).toBeNull();
    expect(screen.getByText('Sign up to add recipes from links')).toBeTruthy();
  });

  it('only prefills for a direct visit with no link', () => {
    render(fakeUser, '/import');
    expect(asking()).toBeNull();
  });

  it('asks once auth has loaded', async () => {
    const view = renderWithProviders(<ImportPage />, { route: SHARE, auth: { isLoading: true } });
    expect(asking()).toBeNull();
    view.unmount();
    render(fakeUser, SHARE);
    await waitFor(() => expect(asking()?.textContent).toContain(askTitle));
  });
});
