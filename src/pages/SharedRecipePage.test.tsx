// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Routes, Route, Link } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe, makeIngredient } from '../test/factories';
import { hashShareUrl } from '../lib/share';
import type { AppUser } from '../types/recipe';

const getPublishedRecipe = vi.fn();
const createRecipe = vi.fn();
const navigateSpy = vi.fn();
const submitMock = vi.fn();
const cloudToggle = vi.fn();
const localToggle = vi.fn();
let cloudOn = false;
let localOn = false;
let cloudError: string | null = null;

vi.mock('../services/firestore', () => ({
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
  incrementRecipeViews: vi.fn(),
}));
vi.mock('../db/recipes', () => ({ createRecipe: (...a: unknown[]) => createRecipe(...a) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackRecipeViewed: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock('../hooks/useFavorites', () => ({
  useCloudFavorite: () => ({ isFavorite: cloudOn, toggleFavorite: cloudToggle, error: cloudError }),
  useFavorite: () => ({ isFavorite: localOn, toggleFavorite: localToggle }),
}));
vi.mock('../hooks/useSuggestions', () => ({
  useSubmitSuggestion: () => ({ submit: (...a: unknown[]) => submitMock(...a) }),
}));

import { SharedRecipePage } from './SharedRecipePage';

const anon: AppUser = { uid: 'anon-1', displayName: 'Waffle', email: null, isAnonymous: true, emailVerified: false };
const author = { uid: 'ada', displayName: 'Ada Lovelace' };

function cloudDoc(over: Record<string, unknown> = {}) {
  return {
    ...makeRecipe({
      id: 'r1',
      title: 'Soup',
      description: 'Warm.',
      createdBy: author,
      ingredients: [{ ...makeIngredient('garlic'), amount: 2, unit: 'clove' }],
      instructions: [{ step: 1, text: 'Simmer.', group: null }],
    }),
    favoriteCount: 0,
    ...over,
  };
}

// `next` is a real in-router link outside the page, to move the route without remounting it.
function open(route: string, user: AppUser | null = fakeUser, next = '/', auth?: { isConfigured: boolean }) {
  return renderWithProviders(
    <>
      <Link to={next}>next link</Link>
      <Routes>
        <Route path="/shared" element={<SharedRecipePage />} />
        <Route path="/shared/:id" element={<SharedRecipePage />} />
      </Routes>
    </>,
    { route, user, auth }
  );
}

const hashRoute = (title = 'Hash Soup') =>
  hashShareUrl(
    makeRecipe({
      title,
      createdBy: author,
      ingredients: [{ ...makeIngredient('garlic'), amount: 2, unit: 'clove' }],
      instructions: [{ step: 1, text: 'Simmer.', group: null }],
    }),
    ''
  );

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  vi.clearAllMocks();
  cloudOn = false;
  localOn = false;
  cloudError = null;
  getPublishedRecipe.mockResolvedValue(cloudDoc());
  createRecipe.mockResolvedValue({ id: 'copy-1' });
  submitMock.mockResolvedValue(undefined);
});

describe('SharedRecipePage /shared/:id', () => {
  it('shows the banner with the author and a link to the app, and the title block', async () => {
    open('/shared/r1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Soup' })).toBeTruthy();
    expect(screen.getByText('Shared by')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' }).getAttribute('href')).toBe('/profile/ada');
    expect(screen.getByRole('link', { name: 'Open Recipe Lab' }).getAttribute('href')).toBe('/');
    // The banner has no favourite control: the footer Save is the only one.
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
  });

  it('footer: Save toggles the favourite (aria-pressed, Saved), Make it yours goes to /vary', async () => {
    open('/shared/r1');
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    expect(cloudToggle).toHaveBeenCalledWith({ ownerId: 'ada', title: 'Soup', emoji: '🍳' });
    fireEvent.click(screen.getByRole('button', { name: 'Make it yours' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/r1/vary');
    expect(screen.getByRole('button', { name: 'Suggest a change' })).toBeTruthy();
  });

  it('signed out, Make it yours opens the sign-in sheet and does not navigate', async () => {
    open('/shared/r1', null);
    fireEvent.click(await screen.findByRole('button', { name: 'Make it yours' }));
    expect(screen.getByRole('dialog', { name: 'Sign in to branch this recipe' })).toBeTruthy();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('labels the footer toggle Saved when on', async () => {
    cloudOn = true;
    open('/shared/r1');
    const saved = await screen.findByRole('button', { name: 'Saved' });
    expect(saved.getAttribute('aria-pressed')).toBe('true');
  });

  it('an unverified account bookmarks locally; signed out is asked to sign in', async () => {
    open('/shared/r1', anon);
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    expect(localToggle).toHaveBeenCalledTimes(1);
    expect(cloudToggle).not.toHaveBeenCalled();
  });

  it('signed out, Save opens the sign-in sheet and writes nothing', async () => {
    open('/shared/r1', null);
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    expect(await screen.findByRole('dialog', { name: 'Sign in to save this recipe' })).toBeTruthy();
    expect(localToggle).not.toHaveBeenCalled();
    expect(cloudToggle).not.toHaveBeenCalled();
  });

  it('the owner gets no heart, no Save and no Suggest, only Make it yours', async () => {
    open('/shared/r1', { ...fakeUser, uid: 'ada' });
    await screen.findByRole('heading', { level: 1, name: 'Soup' });
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest a change' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Make it yours' })).toBeTruthy();
  });

  it('Suggest enters suggest mode for a verified user, sends, and toasts', async () => {
    open('/shared/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest a change' }));
    fireEvent.change(await screen.findByLabelText('Note for Ada Lovelace (optional)'), { target: { value: 'More heat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ada' }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][0]).toMatchObject({
      recipeId: 'r1',
      recipeOwnerId: 'ada',
      recipeTitle: 'Soup',
      message: 'More heat',
    });
    expect((await screen.findByRole('status')).textContent).toBe('Sent to Ada Lovelace');
    expect(screen.getByRole('heading', { level: 1, name: 'Soup' })).toBeTruthy();
  });

  it('an unverified account gets the sign-up dialog, not suggest mode', async () => {
    open('/shared/r1', anon);
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest a change' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in to suggest a change' })).toBeTruthy();
    expect(screen.queryByLabelText('Note for Ada Lovelace (optional)')).toBeNull();
  });

  it('a branch shows the sage line with the author and the prompt', async () => {
    getPublishedRecipe.mockResolvedValue(cloudDoc({ parentId: 'p1', prompt: 'less salt' }));
    open('/shared/r1');
    expect(await screen.findByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Ada Lovelace asked for "less salt".')).toBeTruthy();
  });

  it('a branch with no author says Someone and with a blank prompt skips the prompt', async () => {
    getPublishedRecipe.mockResolvedValue(cloudDoc({ parentId: 'p1', prompt: '  ', createdBy: undefined }));
    open('/shared/r1');
    expect(await screen.findByText('Someone made this variation.')).toBeTruthy();
  });

  it('an original shows no branch line', async () => {
    open('/shared/r1');
    await screen.findByRole('heading', { level: 1, name: 'Soup' });
    expect(screen.queryByText((_, el) => el?.tagName === 'SPAN' && el.textContent?.includes('asked for') === true)).toBeNull();
    expect(screen.queryByText('Ada Lovelace made this variation.')).toBeNull();
  });

  it('not found and a failed load keep their copy, Try Again reloads', async () => {
    getPublishedRecipe.mockResolvedValueOnce(null);
    const { unmount } = open('/shared/r1');
    expect(await screen.findByRole('heading', { name: 'Invalid Link' })).toBeTruthy();
    unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getPublishedRecipe.mockRejectedValueOnce(new Error('offline'));
    open('/shared/r1');
    expect(await screen.findByRole('heading', { name: "Couldn't Load Recipe" })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Soup' })).toBeTruthy();
  });

  it('a missing author reads Someone in the banner', async () => {
    getPublishedRecipe.mockResolvedValue(cloudDoc({ createdBy: undefined }));
    open('/shared/r1');
    await screen.findByRole('heading', { level: 1, name: 'Soup' });
    expect(within(screen.getByRole('banner')).getByText('Someone')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Anonymous' })).toBeNull();
  });

  it('shows a favourite error just above the footer buttons', async () => {
    cloudError = "Couldn't update your favourite.";
    open('/shared/r1');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't update your favourite.");
    expect(alert.parentElement!.contains(screen.getByRole('button', { name: 'Make it yours' }))).toBe(true);
  });

  it('offers no Suggest when Firebase is not configured', async () => {
    open('/shared/r1', fakeUser, '/', { isConfigured: false });
    await screen.findByRole('heading', { level: 1, name: 'Soup' });
    expect(screen.queryByRole('button', { name: 'Suggest a change' })).toBeNull();
  });

  it('closes suggest mode when the route moves to another recipe', async () => {
    getPublishedRecipe.mockImplementation(async (id: string) =>
      cloudDoc({ id, title: id === 'r2' ? 'Stew' : 'Soup' })
    );
    open('/shared/r1', fakeUser, '/shared/r2');
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest a change' }));
    await screen.findByLabelText('Note for Ada Lovelace (optional)');
    fireEvent.click(screen.getByRole('link', { name: 'next link' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stew' })).toBeTruthy();
    expect(screen.queryByLabelText('Note for Ada Lovelace (optional)')).toBeNull();
  });

  it('a send that lands after moving to another recipe does not toast', async () => {
    let resolve!: () => void;
    submitMock.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    getPublishedRecipe.mockImplementation(async (id: string) =>
      cloudDoc({ id, title: id === 'r2' ? 'Stew' : 'Soup' })
    );
    open('/shared/r1', fakeUser, '/shared/r2');
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest a change' }));
    fireEvent.change(await screen.findByLabelText('Note for Ada Lovelace (optional)'), { target: { value: 'More heat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ada' }));
    fireEvent.click(screen.getByRole('link', { name: 'next link' }));
    await screen.findByRole('heading', { level: 1, name: 'Stew' });
    resolve();
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('SharedRecipePage hash link', () => {
  it('has a banner with the author but no heart, Save, Make it yours or Suggest', async () => {
    open(hashRoute());
    expect(await screen.findByRole('heading', { level: 1, name: 'Hash Soup' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make it yours' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest a change' })).toBeNull();
    expect(getPublishedRecipe).not.toHaveBeenCalled();
  });

  it('saves one copy keeping the original author, then offers Open in my library', async () => {
    let resolve!: (v: { id: string }) => void;
    createRecipe.mockReturnValue(new Promise((r) => { resolve = r; }));
    open(hashRoute());
    const save = await screen.findByRole('button', { name: 'Save to my library' });
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(save);
    expect(createRecipe).toHaveBeenCalledTimes(1);
    expect(createRecipe.mock.calls[0][6]).toEqual(author);
    resolve({ id: 'copy-1' });
    const openBtn = await screen.findByRole('button', { name: 'Open in my library' });
    expect(screen.queryByRole('button', { name: 'Save to my library' })).toBeNull();
    expect(document.activeElement).toBe(openBtn);
    fireEvent.click(openBtn);
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/copy-1');
  });

  it('shows Invalid Link for a broken hash', async () => {
    open('/shared#r=garbage');
    expect(await screen.findByRole('heading', { name: 'Invalid Link' })).toBeTruthy();
    expect(screen.getByText('This shared recipe link is invalid or corrupted.')).toBeTruthy();
  });

  it('shows an inline error when the copy cannot be saved, and clears it on the next try', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createRecipe.mockRejectedValueOnce(new Error('quota'));
    open(hashRoute());
    fireEvent.click(await screen.findByRole('button', { name: 'Save to my library' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't save a copy. Try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Save to my library' }));
    await screen.findByRole('button', { name: 'Open in my library' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('moving to another hash link resets the saved copy and the save guard', async () => {
    open(hashRoute('First'), fakeUser, hashRoute('Second'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save to my library' }));
    await screen.findByRole('button', { name: 'Open in my library' });
    fireEvent.click(screen.getByRole('link', { name: 'next link' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Second' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open in my library' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save to my library' }));
    await waitFor(() => expect(createRecipe).toHaveBeenCalledTimes(2));
  });
});
