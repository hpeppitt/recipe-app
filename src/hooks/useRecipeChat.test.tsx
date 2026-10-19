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
vi.mock('../db/recipes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/recipes')>();
  return { ...actual, buildRecipe: vi.fn(actual.buildRecipe) };
});

import { useRecipeChat } from './useRecipeChat';
import { createRecipeChat } from '../services/gemini';
import { searchPublishedRecipes } from '../services/firestore';
import { buildRecipe } from '../db/recipes';
import { IMAGE_ONLY_PROMPT, type ImageAttachment } from '../lib/imageAttachments';

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

describe('useRecipeChat photos as generation input (RL-118)', () => {
  const B64 = 'UEhPVE9CWVRFUw==';
  const photo = (n = 0): ImageAttachment => ({ mimeType: 'image/jpeg', base64: `${B64}${n}` });
  const session = vi.fn();

  beforeEach(() => {
    session.mockResolvedValue(generated('Soup'));
    vi.mocked(createRecipeChat).mockReturnValue({ sendMessage: session });
    vi.mocked(searchPublishedRecipes).mockResolvedValue([]);
  });

  it('passes the images to the session with the text', async () => {
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo()]));

    expect(session).toHaveBeenCalledTimes(1);
    expect(session).toHaveBeenCalledWith('soup', [photo()]);
    expect(result.current.latestRecipe?.title).toBe('Soup');
  });

  it('a send without images calls the session with the text alone', async () => {
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup'));

    expect(session.mock.calls[0][0]).toBe('soup');
    expect(session.mock.calls[0][1]).toBeUndefined();
    expect(result.current.attachmentPreviews).toEqual({});
  });

  it('a photos-only send stores IMAGE_ONLY_PROMPT and skips dedup', async () => {
    const { result } = renderChat();

    await act(() => result.current.sendMessage('  ', [photo()]));

    expect(searchPublishedRecipes).not.toHaveBeenCalled();
    expect(session).toHaveBeenCalledWith(IMAGE_ONLY_PROMPT, [photo()]);
    const [user] = result.current.messages;
    expect(user).toEqual({ role: 'user', content: IMAGE_ONLY_PROMPT, timestamp: expect.any(Number) });
  });

  it('a send with text and photos dedups on the text, and Create New Anyway resends the photos', async () => {
    vi.mocked(searchPublishedRecipes).mockResolvedValue([
      makeRecipe({ id: 'cloud-1', title: 'Soup' }) as never,
    ]);
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo(1), photo(2)]));

    expect(searchPublishedRecipes).toHaveBeenCalledWith('soup');
    expect(session).not.toHaveBeenCalled();
    expect(result.current.similarRecipes).toHaveLength(1);

    await act(() => result.current.dismissSimilar());

    expect(session).toHaveBeenCalledWith('soup', [photo(1), photo(2)]);
  });

  it('retry after a failure resends the images, and a later send does not carry them', async () => {
    session.mockRejectedValueOnce(new Error('network'));
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo()]));
    expect(result.current.error).not.toBeNull();

    await act(() => result.current.retryGeneration());
    expect(session).toHaveBeenLastCalledWith('soup', [photo()]);

    session.mockRejectedValueOnce(new Error('network'));
    await act(() => result.current.sendMessage('spicier'));
    expect(session.mock.calls[2][0]).toBe('spicier');
    expect(session.mock.calls[2][1]).toBeUndefined();

    // Retrying the text-only send must not pick up the earlier photos.
    await act(() => result.current.retryGeneration());
    expect(session.mock.calls[3][0]).toBe('spicier');
    expect(session.mock.calls[3][1]).toBeUndefined();
  });

  it('keys previews as data URLs by the user message timestamp', async () => {
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo(1), photo(2)]));

    const [user] = result.current.messages;
    expect(result.current.attachmentPreviews).toEqual({
      [user.timestamp]: [`data:image/jpeg;base64,${B64}1`, `data:image/jpeg;base64,${B64}2`],
    });
  });

  it('rejects a fourth photo in one message without sending or adding a message', async () => {
    const { result } = renderChat();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.sendMessage('soup', [photo(1), photo(2), photo(3), photo(4)]);
    });

    expect(outcome).toBe('message-limit');
    expect(session).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('rejects a send that would take the chat past six photos, and a new chat starts at zero', async () => {
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup', [photo(1), photo(2), photo(3)]));
    await act(() => result.current.sendMessage('spicier', [photo(4), photo(5)]));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.sendMessage('more', [photo(6), photo(7)]);
    });

    expect(outcome).toBe('chat-limit');
    expect(session).toHaveBeenCalledTimes(2);
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(2);

    const fresh = renderChat();
    await act(() => fresh.result.current.sendMessage('soup', [photo(1), photo(2), photo(3)]));
    expect(session).toHaveBeenCalledTimes(3);
    expect(fresh.result.current.attachmentPreviews).not.toEqual(result.current.attachmentPreviews);
  });

  it('counts only photos from successful turns against the chat limit', async () => {
    session.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(new Error('network'));
    const { result } = renderChat();
    const send = async (text: string, images: ImageAttachment[]) => {
      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.sendMessage(text, images);
      });
      return outcome;
    };

    // Two failed sends of 3 cost nothing.
    expect(await send('soup', [photo(1), photo(2), photo(3)])).toBeNull();
    expect(await send('soup', [photo(1), photo(2), photo(3)])).toBeNull();
    // Two successful sends of 3 fill the chat.
    expect(await send('soup', [photo(1), photo(2), photo(3)])).toBeNull();
    expect(await send('spicier', [photo(4), photo(5), photo(6)])).toBeNull();
    expect(session).toHaveBeenCalledTimes(4);

    expect(await send('more', [photo(7)])).toBe('chat-limit');
    expect(session).toHaveBeenCalledTimes(4);
  });

  it('a dedup match that is never continued costs no photos', async () => {
    vi.mocked(searchPublishedRecipes)
      .mockResolvedValueOnce([makeRecipe({ id: 'cloud-1', title: 'Soup' }) as never])
      .mockResolvedValue([]);
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo(1), photo(2), photo(3)]));
    expect(session).not.toHaveBeenCalled();
    await act(() => result.current.sendMessage('stew', [photo(4), photo(5), photo(6)]));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.sendMessage('spicier', [photo(7), photo(8), photo(9)]);
    });

    expect(outcome).toBeNull();
    expect(session).toHaveBeenCalledTimes(2);
  });

  it('forgets the photos once a send has generated', async () => {
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo()]));
    await act(() => result.current.retryGeneration());

    expect(session).toHaveBeenCalledTimes(2);
    expect(session.mock.calls[1][0]).toBe('soup');
    expect(session.mock.calls[1][1]).toBeUndefined();
  });

  it('redacts echoed photo data from a generation error before it is reported or classified', async () => {
    const run = 'A'.repeat(100) + '401' + 'B'.repeat(100) + '500' + 'C'.repeat(100);
    session.mockRejectedValueOnce(new Error(`Bad request: ${run}`));
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo()]));

    const reported = reportError.mock.calls[0][0] as Error;
    expect(reported.message).toBe('Bad request: [redacted]');
    expect(reported.stack ?? '').not.toContain(run);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(run);
    expect(result.current.error?.message).toBe('Something went wrong generating the recipe. Please try again.');
  });

  it('reports an ordinary generation error unchanged', async () => {
    const err = new Error('Failed to fetch');
    session.mockRejectedValueOnce(err);
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup'));

    expect(reportError).toHaveBeenCalledWith(err, 'generate-recipe');
    expect(result.current.error?.message).toBe("Couldn't reach Gemini. Check your connection and try again.");
  });

  it('after save, no photo data reaches chatHistory or prompt', async () => {
    publishRecipe.mockResolvedValue(undefined);
    const { result } = renderChat();
    await act(() => result.current.sendMessage('', [photo()]));
    await act(() => result.current.sendMessage('spicier', [photo(1)]));

    await act(() => result.current.saveRecipe());

    const built = vi.mocked(buildRecipe).mock.calls[0];
    const [, prompt, chatHistory] = built;
    const sent = publishRecipe.mock.calls[0][0] as Recipe;
    expect(prompt).toBe(IMAGE_ONLY_PROMPT);
    expect(sent.prompt).toBe(IMAGE_ONLY_PROMPT);
    for (const value of [prompt, chatHistory, sent.prompt, sent.chatHistory, sent]) {
      const json = JSON.stringify(value);
      expect(json).not.toContain(B64);
      expect(json).not.toContain('data:image');
    }
  });
});
