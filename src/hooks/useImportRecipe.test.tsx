// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { db } from '../db/database';
import { makeIngredient, makeRecipe } from '../test/factories';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { IMPORT_ERROR_MESSAGE, type ImportDraft } from '../lib/linkImport';
import type { Recipe } from '../types/recipe';

const { publishRecipe, importRecipeFromUrl, getAllPublishedRecipes, navigate, notifyBranched, reportError } = vi.hoisted(() => ({
  publishRecipe: vi.fn(),
  notifyBranched: vi.fn(),
  reportError: vi.fn(),
  importRecipeFromUrl: vi.fn(),
  getAllPublishedRecipes: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('../services/firestore', () => ({
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  notifyBranched: (...a: unknown[]) => notifyBranched(...a),
  getAllPublishedRecipes: (...a: unknown[]) => getAllPublishedRecipes(...a),
  searchPublishedVariations: vi.fn(),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/gemini', () => ({
  createRecipeChat: vi.fn(),
  createVariationChat: vi.fn(),
  importRecipeFromUrl: (...a: unknown[]) => importRecipeFromUrl(...a),
}));
vi.mock('../services/analytics', () => ({ trackRecipeCreated: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { useImportRecipe } from './useImportRecipe';
import { clearPublishedWindow } from '../services/publishedWindow';

const PAGE = 'https://www.seriouseats.com/chicken-stew';

function draftOf(title: string, uncertain = 0): ImportDraft {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } = makeRecipe({
    title,
    ingredients: [makeIngredient('chicken'), { ...makeIngredient('salt'), amount: null, uncertain: uncertain > 0 } as Recipe['ingredients'][number]],
    instructions: [{ step: 1, text: 'Cook it.', group: null }],
  });
  return { recipe: { ...rest, importedFrom: PAGE }, uncertainCount: uncertain, error: null };
}

function renderImport() {
  return renderHook(() => useImportRecipe(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={{ user: fakeUser } as AuthContextType}>{children}</AuthContext.Provider>
    ),
  });
}

const savedRecipe = () => publishRecipe.mock.calls[0][0] as Recipe;

beforeEach(async () => {
  vi.clearAllMocks();
  clearPublishedWindow();
  getAllPublishedRecipes.mockResolvedValue([]);
  publishRecipe.mockResolvedValue(undefined);
  importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew'));
  await db.recipes.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('useImportRecipe read', () => {
  it('refuses a link that is not a public http(s) page without calling the model', async () => {
    const { result } = renderImport();
    for (const bad of ['', 'localhost:3000/stew', 'ftp://a.com/x', 'http://192.168.1.4/stew', 'not a link']) {
      await act(() => result.current.read(bad));
      expect(result.current.readError).toBe(IMPORT_ERROR_MESSAGE);
    }
    expect(importRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('reads a page into a preview with its host and uncertain count', async () => {
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew', 1));
    const { result } = renderImport();
    await act(() => result.current.read('seriouseats.com/chicken-stew'));
    expect(importRecipeFromUrl).toHaveBeenCalledWith('https://seriouseats.com/chicken-stew');
    expect(result.current.preview).toMatchObject({ host: 'seriouseats.com', uncertainCount: 1, family: null });
    expect(result.current.readError).toBeNull();
  });

  it('shows the service error and no preview when the page cannot be read', async () => {
    importRecipeFromUrl.mockResolvedValue({ recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE });
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    expect(result.current.preview).toBeNull();
    expect(result.current.readError).toBe(IMPORT_ERROR_MESSAGE);
  });

  it('offers the family of a same match, counting local and cloud versions once each', async () => {
    const root = makeRecipe({ id: 'root', title: 'Chicken Stew', createdBy: { uid: 'u2', displayName: 'Ana' } });
    const branch = makeRecipe({ id: 'b1', parentId: 'root', rootId: 'root', depth: 1, title: 'Spicy Chicken Stew' });
    await db.recipes.bulkAdd([root, branch]);
    getAllPublishedRecipes.mockResolvedValue([
      { ...root },
      { ...makeRecipe({ id: 'b2', parentId: 'root', rootId: 'root', depth: 1, title: 'Smoky Chicken Stew' }) },
    ]);
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    expect(result.current.preview?.family).toEqual({ rootId: 'root', title: 'Chicken Stew', emoji: root.emoji, rootUid: 'u2', author: { uid: 'u2', name: 'Ana' }, versions: 3 });
  });

  it('offers no family when the original is neither on the device nor in the window', async () => {
    await db.recipes.add(makeRecipe({ id: 'b1', parentId: 'root', rootId: 'root', depth: 1, title: 'Chicken Stew' }));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    expect(result.current.preview?.family).toBeNull();
  });

  it('offers no family for a match that is only similar', async () => {
    await db.recipes.add(makeRecipe({ id: 'root', title: 'Chicken Curry' }));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    expect(result.current.preview?.family).toBeNull();
  });
});

describe('useImportRecipe save', () => {
  it('saves a new original cloud first with importedFrom, importedVia and the host prompt', async () => {
    let inDexieAtPublish: unknown = 'unset';
    publishRecipe.mockImplementation(async (r: Recipe) => {
      inDexieAtPublish = await db.recipes.get(r.id);
    });
    importRecipeFromUrl.mockResolvedValue(draftOf('Chicken Stew', 1));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    await act(() => result.current.save(false));

    const saved = savedRecipe();
    expect(inDexieAtPublish).toBeUndefined();
    expect(saved).toMatchObject({
      parentId: null,
      rootId: saved.id,
      depth: 0,
      prompt: 'Imported from seriouseats.com',
      importedFrom: PAGE,
      importedVia: { uid: fakeUser.uid, displayName: fakeUser.displayName },
      createdBy: { uid: fakeUser.uid, displayName: fakeUser.displayName },
      chatHistory: [],
    });
    expect(saved.ingredients[1]).toEqual({ amount: null, unit: null, name: 'salt', notes: null, group: null });
    expect((await db.recipes.get(saved.id))?.importedFrom).toBe(PAGE);
    expect(navigate).toHaveBeenCalledWith(`/recipe/${saved.id}`, { state: { saved: 'cloud', note: null } });
  });

  it('adds to the family as a branch of its original', async () => {
    await db.recipes.add(makeRecipe({ id: 'root', title: 'Chicken Stew' }));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    await act(() => result.current.save(true));

    expect(savedRecipe()).toMatchObject({ parentId: 'root', rootId: 'root', depth: 1, prompt: 'Imported from seriouseats.com' });
  });

  it("tells the original's author about a branch, but not when the family is your own", async () => {
    await db.recipes.add(makeRecipe({ id: 'root', title: 'Chicken Stew', emoji: '🍲', createdBy: { uid: 'u2', displayName: 'Ana' } }));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    await act(() => result.current.save(true));
    expect(notifyBranched).toHaveBeenCalledWith({
      branch: savedRecipe(),
      parent: { title: 'Chicken Stew', emoji: '🍲', createdBy: { uid: 'u2' } },
      from: { uid: fakeUser.uid, displayName: fakeUser.displayName },
    });

    notifyBranched.mockClear();
    await db.recipes.clear();
    clearPublishedWindow();
    await db.recipes.add(makeRecipe({ id: 'mine', title: 'Chicken Stew', createdBy: { uid: fakeUser.uid, displayName: null } }));
    const own = renderImport();
    await act(() => own.result.current.read(PAGE));
    await act(() => own.result.current.save(true));
    expect(notifyBranched).not.toHaveBeenCalled();
  });

  it('a save as a new original never notifies, and a throwing notify still caches the branch', async () => {
    await db.recipes.add(makeRecipe({ id: 'root', title: 'Chicken Stew', createdBy: { uid: 'u2', displayName: 'Ana' } }));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    await act(() => result.current.save(false));
    expect(notifyBranched).not.toHaveBeenCalled();
    // The saved original is a second Chicken Stew; drop it so the next read matches Ana's again.
    await db.recipes.delete(savedRecipe().id);

    notifyBranched.mockImplementation(() => {
      throw new Error('boom');
    });
    const again = renderImport();
    await act(() => again.result.current.read(PAGE));
    await act(() => again.result.current.save(true));
    const branch = publishRecipe.mock.calls[1][0] as Recipe;
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'save-recipe-notify');
    expect((await db.recipes.get(branch.id))?.parentId).toBe('root');
    expect(navigate).toHaveBeenLastCalledWith(`/recipe/${branch.id}`, { state: { saved: 'cloud', note: null } });
  });

  it('reset drops the preview', async () => {
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    act(() => result.current.reset());
    expect(result.current.preview).toBeNull();
  });

  it('a failed publish writes nothing, shows the chat copy and allows a retry with the same id', async () => {
    publishRecipe.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderImport();
    await act(() => result.current.read(PAGE));
    await act(() => result.current.save(false));

    expect(await db.recipes.count()).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.saveError).toBe("Couldn't save the recipe. Check your connection and try again.");
    expect(result.current.isSaving).toBe(false);

    await act(() => result.current.save(false));
    const [first, second] = publishRecipe.mock.calls.map((c) => (c[0] as Recipe).id);
    expect(second).toBe(first);
    expect(await db.recipes.count()).toBe(1);
  });
});
