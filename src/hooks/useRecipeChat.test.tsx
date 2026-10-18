// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { db } from '../db/database';
import { makeRecipe } from '../test/factories';
import { RateLimitedError } from '../lib/errors';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import type { GeneratedRecipe } from '../types/api';
import type { Recipe } from '../types/recipe';

const { publishRecipe, navigate, reportError, config } = vi.hoisted(() => ({
  publishRecipe: vi.fn(),
  navigate: vi.fn(),
  reportError: vi.fn(),
  config: { firebase: true },
}));
vi.mock('../services/firestore', () => ({
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  searchPublishedRecipes: vi.fn(),
  searchPublishedVariations: vi.fn(),
}));
vi.mock('../services/firebase', () => ({
  get isFirebaseConfigured() {
    return config.firebase;
  },
}));
vi.mock('../services/gemini', () => ({ createRecipeChat: vi.fn(), createVariationChat: vi.fn() }));
vi.mock('../services/analytics', () => ({ trackRecipeCreated: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { useRecipeChat } from './useRecipeChat';

function generated(title: string): GeneratedRecipe {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } =
    makeRecipe({ title });
  return rest;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: fakeUser } as AuthContextType}>{children}</AuthContext.Provider>
  );
}

function renderChat() {
  return renderHook(() => useRecipeChat(), { wrapper });
}

const published = () => publishRecipe.mock.calls.map((c) => (c[0] as Recipe).id);

beforeEach(async () => {
  vi.clearAllMocks();
  config.firebase = true;
  await db.recipes.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('useRecipeChat saveRecipe (cloud first)', () => {
  it('publishes before the Dexie write, then caches and navigates as cloud', async () => {
    let inDexieAtPublish: unknown = 'unset';
    publishRecipe.mockImplementation(async (r: Recipe) => {
      inDexieAtPublish = await db.recipes.get(r.id);
    });
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    const [id] = published();
    expect(inDexieAtPublish).toBeUndefined();
    expect((await db.recipes.get(id))?.title).toBe('Soup');
    expect((await db.recipes.get(id))?.createdBy.uid).toBe(fakeUser.uid);
    expect(navigate).toHaveBeenCalledWith(`/recipe/${id}`, { state: { saved: 'cloud', note: null } });
    expect(result.current.error).toBeNull();
  });

  it('a failed publish writes nothing, stays on the page, sets the error and re-enables save', async () => {
    publishRecipe.mockRejectedValue(new Error('offline'));
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    expect(await db.recipes.count()).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.error?.message).toBe(
      "Couldn't save the recipe. Check your connection and try again."
    );
    expect(result.current.isSaving).toBe(false);
  });

  it('a timed-out publish is a failure too', async () => {
    publishRecipe.mockReturnValue(new Promise(() => {}));
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    expect(await db.recipes.count()).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.error?.message).toMatch(/Couldn't save the recipe/);
    expect(result.current.isSaving).toBe(false);
  }, 10000);

  it('shows the daily-cap message when the publish is rate limited', async () => {
    publishRecipe.mockRejectedValue(new RateLimitedError('recipe'));
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    expect(result.current.error?.message).toBe("You've published a lot today. Try again tomorrow.");
    expect(await db.recipes.count()).toBe(0);
  });

  it('saving a different version builds a new recipe', async () => {
    publishRecipe.mockRejectedValue(new Error('offline'));
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));
    await act(() => result.current.saveRecipe({ recipe: generated('Stew'), prompt: 'stew' }));

    const [first, second] = published();
    expect(second).not.toBe(first);
  });

  it('a successful retry of the same version reuses the failed attempt id', async () => {
    publishRecipe.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const soup = generated('Soup');
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: soup, prompt: 'soup' }));
    await act(() => result.current.saveRecipe({ recipe: soup, prompt: 'soup' }));

    const [first, second] = published();
    expect(second).toBe(first);
    expect(await db.recipes.get(first)).toBeDefined();
    expect(navigate).toHaveBeenCalledWith(`/recipe/${first}`, { state: { saved: 'cloud', note: null } });
  });

  it('a Dexie failure after a successful publish is reported and the save still completes', async () => {
    publishRecipe.mockResolvedValue(undefined);
    vi.spyOn(db.recipes, 'put').mockRejectedValue(new Error('quota'));
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    const [id] = published();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'save-recipe-cache');
    expect(navigate).toHaveBeenCalledWith(`/recipe/${id}`, { state: { saved: 'cloud', note: null } });
    expect(result.current.error).toBeNull();
  });

  it('without Firebase it saves to Dexie only, as before', async () => {
    config.firebase = false;
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    expect(publishRecipe).not.toHaveBeenCalled();
    const [row] = await db.recipes.toArray();
    expect(row.title).toBe('Soup');
    expect(navigate).toHaveBeenCalledWith(`/recipe/${row.id}`, { state: { saved: 'local', note: null } });
  });
});
