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

const { publishRecipe, notifyBranched, setCookBranch, getTasteProfile, saveTasteProfile, navigate, reportError, config } = vi.hoisted(() => ({
  publishRecipe: vi.fn(),
  getTasteProfile: vi.fn(),
  saveTasteProfile: vi.fn(),
  notifyBranched: vi.fn(),
  setCookBranch: vi.fn(),
  navigate: vi.fn(),
  reportError: vi.fn(),
  config: { firebase: true },
}));
vi.mock('../services/firestore', () => ({
  publishRecipe: (...a: unknown[]) => publishRecipe(...a),
  notifyBranched: (...a: unknown[]) => notifyBranched(...a),
  setCookBranch: (...a: unknown[]) => setCookBranch(...a),
  getTasteProfile: (...a: unknown[]) => getTasteProfile(...a),
  saveTasteProfile: (...a: unknown[]) => saveTasteProfile(...a),
  getAllPublishedRecipes: vi.fn(),
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
import { createRecipeChat, createVariationChat } from '../services/gemini';
import { trackRecipeCreated } from '../services/analytics';
import { getAllPublishedRecipes } from '../services/firestore';
import { clearPublishedWindow } from '../services/publishedWindow';
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
  getTasteProfile.mockResolvedValue({ avoids: [], hidden: [], askedAt: null });
  clearPublishedWindow();
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

describe('useRecipeChat saveRecipe landing (RL-181)', () => {
  it('a saved branch opens the recipe, then What changed with the toast state', async () => {
    publishRecipe.mockResolvedValue(undefined);
    const parent = makeRecipe({ title: 'Banana bread' });
    const { result } = renderHook(() => useRecipeChat(parent), { wrapper });

    await act(() => result.current.saveRecipe({ recipe: generated('Vegan bread'), prompt: 'vegan' }));

    const [id] = published();
    expect(navigate.mock.calls).toEqual([
      [`/recipe/${id}`],
      [`/recipe/${id}/changes`, { state: { saved: 'cloud', note: null } }],
    ]);
  });

  it('a new original still opens the recipe page only', async () => {
    publishRecipe.mockResolvedValue(undefined);
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('useRecipeChat saveRecipe tells the parent author about a branch (RL-153)', () => {
  const branchOf = (parent: Recipe) => renderHook(() => useRecipeChat(parent), { wrapper });
  const save = async (parent: Recipe) => {
    const { result } = branchOf(parent);
    await act(() => result.current.saveRecipe({ recipe: generated('Vegan bread'), prompt: 'vegan, no eggs' }));
  };

  it("notifies after publishing a branch of someone else's recipe", async () => {
    publishRecipe.mockResolvedValue(undefined);
    const parent = makeRecipe({ title: 'Banana bread', createdBy: { uid: 'lin', displayName: 'Lin' } });

    await save(parent);

    const [id] = published();
    expect(notifyBranched).toHaveBeenCalledTimes(1);
    const [{ branch, parent: p, from }] = notifyBranched.mock.calls[0] as [{ branch: Recipe; parent: Recipe; from: unknown }];
    expect(branch.id).toBe(id);
    expect(branch.parentId).toBe(parent.id);
    expect(branch.prompt).toBe('vegan, no eggs');
    expect(p).toBe(parent);
    expect(from).toEqual({ uid: fakeUser.uid, displayName: fakeUser.displayName ?? null });
    expect(publishRecipe.mock.invocationCallOrder[0]).toBeLessThan(notifyBranched.mock.invocationCallOrder[0]);
  });

  it('does not notify for your own parent or a local one', async () => {
    publishRecipe.mockResolvedValue(undefined);

    await save(makeRecipe({ createdBy: { uid: fakeUser.uid, displayName: null } }));
    await save(makeRecipe({ createdBy: { uid: 'local', displayName: null } }));

    expect(published()).toHaveLength(2);
    expect(notifyBranched).not.toHaveBeenCalled();
  });

  it('does not notify when the publish fails', async () => {
    publishRecipe.mockRejectedValue(new Error('offline'));

    await save(makeRecipe({ createdBy: { uid: 'lin', displayName: 'Lin' } }));

    expect(notifyBranched).not.toHaveBeenCalled();
  });

  it('does not notify for a new recipe with no parent', async () => {
    publishRecipe.mockResolvedValue(undefined);
    const { result } = renderChat();

    await act(() => result.current.saveRecipe({ recipe: generated('Soup'), prompt: 'soup' }));

    expect(notifyBranched).not.toHaveBeenCalled();
  });
});

describe('useRecipeChat saveRecipe credits the cook a branch grew from (RL-201)', () => {
  const parent = makeRecipe({ title: 'Banana bread' });
  const grown = () => renderHook(() => useRecipeChat(parent, 'cook1'), { wrapper });
  const save = (r: ReturnType<typeof grown>['result'], title = 'Less salt') =>
    act(() => r.current.saveRecipe({ recipe: generated(title), prompt: 'less salt' }));

  it('credits the cook with the branch after the publish succeeds', async () => {
    publishRecipe.mockResolvedValue(undefined);
    setCookBranch.mockResolvedValue(undefined);
    const { result } = grown();

    await save(result);

    const [id] = published();
    expect(setCookBranch).toHaveBeenCalledWith('cook1', id);
    expect(publishRecipe.mock.invocationCallOrder[0]).toBeLessThan(setCookBranch.mock.invocationCallOrder[0]);
  });

  it('does not credit when the publish fails', async () => {
    publishRecipe.mockRejectedValue(new Error('offline'));
    const { result } = grown();

    await save(result);

    expect(setCookBranch).not.toHaveBeenCalled();
  });

  it('a failed credit is reported and the save still completes and navigates', async () => {
    publishRecipe.mockResolvedValue(undefined);
    setCookBranch.mockRejectedValue(new Error('denied'));
    const { result } = grown();

    await save(result);

    const [id] = published();
    expect(navigate).toHaveBeenCalledWith(`/recipe/${id}/changes`, { state: { saved: 'cloud', note: null } });
    expect(result.current.error).toBeNull();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'cook-branch');
    expect((await db.recipes.get(id))?.title).toBe('Less salt');
  });

  it('a credit that never settles does not block the save', async () => {
    publishRecipe.mockResolvedValue(undefined);
    setCookBranch.mockReturnValue(new Promise(() => {}));
    const { result } = grown();

    await save(result);

    expect(navigate).toHaveBeenCalledWith(`/recipe/${published()[0]}/changes`, expect.anything());
  });

  it('credits only the first saved variation, after a failed attempt', async () => {
    publishRecipe.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    setCookBranch.mockResolvedValue(undefined);
    const { result } = grown();

    await save(result);
    await save(result);
    await save(result, 'Even less salt');

    expect(setCookBranch).toHaveBeenCalledTimes(1);
    expect(setCookBranch).toHaveBeenCalledWith('cook1', published()[1]);
  });

  it('does nothing without a cook', async () => {
    publishRecipe.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecipeChat(parent), { wrapper });

    await save(result);

    expect(setCookBranch).not.toHaveBeenCalled();
  });
});

describe('useRecipeChat records the related family after Create anyway (RL-162)', () => {
  const session = vi.fn();
  const savedRecipe = () => publishRecipe.mock.calls.at(-1)![0] as Recipe;

  beforeEach(() => {
    publishRecipe.mockResolvedValue(undefined);
    session.mockResolvedValue(generated('Soup'));
    vi.mocked(createRecipeChat).mockReturnValue({ sendMessage: session });
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([
      makeRecipe({ id: 'v2', rootId: 'fam-1', title: 'Soup' }) as never,
      makeRecipe({ id: 'other', rootId: 'fam-2', title: 'Soup two' }) as never,
    ]);
  });

  it("stores the first match's rootId on the saved original, published and cached, and refining keeps it", async () => {
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup'));
    expect(result.current.similarRecipes.map((m) => m.rootId)).toEqual(['fam-1', 'fam-2']);

    await act(() => result.current.dismissSimilar());
    session.mockResolvedValue(generated('Spicy soup'));
    await act(() => result.current.sendMessage('spicier'));
    await act(() => result.current.saveRecipe());

    const saved = savedRecipe();
    expect(saved.title).toBe('Spicy soup');
    expect(saved.parentId).toBeNull();
    expect(saved.relatedFamilyId).toBe('fam-1');
    expect((await db.recipes.get(saved.id))?.relatedFamilyId).toBe('fam-1');
  });

  it('is not set when there was no match to create past', async () => {
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup'));
    await act(() => result.current.saveRecipe());

    expect(savedRecipe()).not.toHaveProperty('relatedFamilyId');
  });

  it('a failed generation after Create anyway does not tag a later unmatched original', async () => {
    session.mockRejectedValueOnce(new Error('network'));
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup'));
    await act(() => result.current.dismissSimilar());
    expect(result.current.error).not.toBeNull();

    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
    await act(() => result.current.sendMessage('pancakes'));
    await act(() => result.current.saveRecipe());

    expect(savedRecipe()).not.toHaveProperty('relatedFamilyId');
  });

  it('records nothing when the first match is a branch with no rootId', async () => {
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([
      { ...makeRecipe({ id: 'br', parentId: 'p', title: 'Soup' }), rootId: undefined } as never,
    ]);
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup'));
    expect(result.current.similarRecipes[0].rootId).toBeNull();
    await act(() => result.current.dismissSimilar());
    await act(() => result.current.saveRecipe());

    expect(savedRecipe()).not.toHaveProperty('relatedFamilyId');
  });

  it('a new chat starts without it', async () => {
    const first = renderChat();
    await act(() => first.result.current.sendMessage('soup'));
    await act(() => first.result.current.dismissSimilar());

    clearPublishedWindow();
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup'));
    await act(() => result.current.saveRecipe());

    expect(savedRecipe()).not.toHaveProperty('relatedFamilyId');
  });

  it('a variation is never given one, even after Create anyway', async () => {
    const { searchPublishedVariations } = await import('../services/firestore');
    vi.mocked(searchPublishedVariations).mockResolvedValue([
      makeRecipe({ id: 'sib', rootId: 'fam-1', parentId: 'fam-1', title: 'Soup' }) as never,
    ]);
    const { createVariationChat } = await import('../services/gemini');
    vi.mocked(createVariationChat).mockReturnValue({ sendMessage: session });
    const parent = makeRecipe({ id: 'fam-1', createdBy: { uid: fakeUser.uid, displayName: null } });
    const { result } = renderHook(() => useRecipeChat(parent), { wrapper });

    await act(() => result.current.sendMessage('soup'));
    expect(result.current.similarRecipes).toHaveLength(1);
    await act(() => result.current.dismissSimilar());
    await act(() => result.current.saveRecipe());

    expect(savedRecipe().parentId).toBe('fam-1');
    expect(savedRecipe()).not.toHaveProperty('relatedFamilyId');
  });
});

describe('useRecipeChat photos as generation input (RL-118)', () => {
  const B64 = 'UEhPVE9CWVRFUw==';
  const photo = (n = 0): ImageAttachment => ({ mimeType: 'image/jpeg', base64: `${B64}${n}` });
  const session = vi.fn();

  beforeEach(() => {
    session.mockResolvedValue(generated('Soup'));
    vi.mocked(createRecipeChat).mockReturnValue({ sendMessage: session });
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
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

    expect(getAllPublishedRecipes).not.toHaveBeenCalled();
    expect(session).toHaveBeenCalledWith(IMAGE_ONLY_PROMPT, [photo()]);
    const [user] = result.current.messages;
    expect(user).toEqual({ role: 'user', content: IMAGE_ONLY_PROMPT, timestamp: expect.any(Number) });
  });

  it('a send with text and photos dedups on the text, and Create New Anyway resends the photos', async () => {
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([
      makeRecipe({ id: 'cloud-1', title: 'Soup' }) as never,
    ]);
    const { result } = renderChat();

    await act(() => result.current.sendMessage('soup', [photo(1), photo(2)]));

    expect(getAllPublishedRecipes).toHaveBeenCalledTimes(1);
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
    expect(result.current.sentImageCount).toBe(0);
    // Two successful sends of 3 fill the chat.
    expect(await send('soup', [photo(1), photo(2), photo(3)])).toBeNull();
    expect(await send('spicier', [photo(4), photo(5), photo(6)])).toBeNull();
    expect(session).toHaveBeenCalledTimes(4);
    expect(result.current.sentImageCount).toBe(6);

    expect(await send('more', [photo(7)])).toBe('chat-limit');
    expect(session).toHaveBeenCalledTimes(4);
  });

  it('a dedup match that is never continued costs no photos', async () => {
    vi.mocked(getAllPublishedRecipes)
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

describe('useRecipeChat typing-pause dedup card (RL-178)', () => {
  const session = vi.fn();
  const window200 = [
    makeRecipe({ id: 'bb', rootId: 'bb', title: 'Banana bread', createdBy: { uid: 'u2', displayName: 'Mia' } }),
    makeRecipe({ id: 'bb2', rootId: 'bb', parentId: 'bb', title: 'Vegan banana bread', createdBy: { uid: 'u3', displayName: null } }),
  ];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    session.mockResolvedValue(generated('Banana bread'));
    vi.mocked(createRecipeChat).mockReturnValue({ sendMessage: session });
    vi.mocked(getAllPublishedRecipes).mockResolvedValue(window200 as never);
  });
  afterEach(() => vi.useRealTimers());

  const type = (r: { current: ReturnType<typeof useRecipeChat> }, text: string) =>
    act(() => r.current.previewDuplicates(text));
  const pause = (ms = 700) => act(() => vi.advanceTimersByTimeAsync(ms));

  it('waits 700 ms after the last keystroke of at least 3 characters', async () => {
    const { result } = renderChat();
    await type(result, 'ba');
    await pause(1000);
    expect(getAllPublishedRecipes).not.toHaveBeenCalled();
    expect(result.current.typingMatches).toBeNull();

    await type(result, 'banana');
    await pause(500);
    await type(result, 'banana bread');
    await pause(699);
    expect(result.current.typingMatches).toBeNull();
    await pause(1);

    expect(result.current.typingMatches?.matches.map((m) => m.id)).toEqual(['bb', 'bb2']);
    expect(result.current.typingMatches?.family).toEqual({ versions: 2, cooks: 2 });
    expect(result.current.typingAnnouncement).toBe('2 similar recipes already here');
  });

  it('reads the cloud window once across pauses and the send check', async () => {
    const { result } = renderChat();
    await type(result, 'banana bread');
    await pause();
    await type(result, 'vegan banana bread');
    await pause();
    await act(() => result.current.sendMessage('banana bread'));

    expect(getAllPublishedRecipes).toHaveBeenCalledTimes(1);
    expect(result.current.similarRecipes.map((m) => m.id)).toEqual(['bb', 'bb2']);
    expect(result.current.typingMatches).toBeNull();
    expect(result.current.typingAnnouncement).toBe('');
  });

  it('hides when the text no longer matches', async () => {
    const { result } = renderChat();
    await type(result, 'banana bread');
    await pause();
    expect(result.current.typingMatches).not.toBeNull();
    await type(result, 'fish tacos');
    await pause();
    expect(result.current.typingMatches).toBeNull();
  });

  it('a stale lookup does not overwrite a newer one', async () => {
    let release: (v: never) => void = () => {};
    vi.mocked(getAllPublishedRecipes).mockReturnValue(new Promise((r) => (release = r)));
    const { result } = renderChat();
    await type(result, 'banana bread');
    await pause();
    await type(result, 'fish tacos');
    await act(async () => release(window200 as never));
    // The banana lookup finished after "fish tacos" was typed, before its own pause.
    expect(result.current.typingMatches).toBeNull();
    await pause();
    expect(result.current.typingMatches).toBeNull();
  });

  it('Hide matches dismisses it for the rest of the chat', async () => {
    const { result } = renderChat();
    await type(result, 'banana bread');
    await pause();
    act(() => result.current.hideTypingMatches());
    expect(result.current.typingMatches).toBeNull();
    await type(result, 'vegan banana bread');
    await pause();
    expect(result.current.typingMatches).toBeNull();
  });

  it('send is not delayed by a pending pause and generates when nothing matches', async () => {
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
    const { result } = renderChat();
    await type(result, 'banana bread');
    await act(() => result.current.sendMessage('banana bread'));
    expect(session).toHaveBeenCalledTimes(1);
    await pause();
    expect(result.current.typingMatches).toBeNull();
  });

  it('a failed window read is retried once by the next caller, then the chat stays local-only', async () => {
    vi.mocked(getAllPublishedRecipes).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderChat();
    await type(result, 'banana bread');
    await pause();
    expect(result.current.typingMatches).toBeNull();

    await type(result, 'banana bread ');
    await pause();
    expect(getAllPublishedRecipes).toHaveBeenCalledTimes(2);
    expect(result.current.typingMatches?.matches.map((m) => m.id)).toEqual(['bb', 'bb2']);
    expect(result.current.typingMatches?.query).toBe('banana bread');
  });

  it('stops reading after two failures in one chat', async () => {
    vi.mocked(getAllPublishedRecipes).mockRejectedValue(new Error('offline'));
    const { result } = renderChat();
    for (const text of ['banana bread', 'vegan banana bread', 'banana loaf']) {
      await type(result, text);
      await pause();
    }
    await act(() => result.current.sendMessage('banana bread'));
    expect(getAllPublishedRecipes).toHaveBeenCalledTimes(2);
    expect(session).toHaveBeenCalledTimes(1);
  });

  it('a second chat within the TTL reuses the window', async () => {
    const first = renderChat();
    await type(first.result, 'banana bread');
    await pause();
    const second = renderChat();
    await type(second.result, 'banana bread');
    await pause();
    expect(second.result.current.typingMatches).not.toBeNull();
    expect(getAllPublishedRecipes).toHaveBeenCalledTimes(1);
  });

  it('a local read failure clears the card', async () => {
    const { result } = renderChat();
    await type(result, 'banana bread');
    await pause();
    expect(result.current.typingMatches).not.toBeNull();
    vi.spyOn(db.recipes, 'toArray').mockRejectedValueOnce(new Error('idb'));
    await type(result, 'vegan banana bread');
    await pause();
    expect(result.current.typingMatches).toBeNull();
  });

  it('never shows on a variation, after the first recipe, or in local-only mode', async () => {
    const parent = makeRecipe({ id: 'p' });
    const vary = renderHook(() => useRecipeChat(parent), { wrapper });
    await type(vary.result, 'banana bread');
    await pause();
    expect(vary.result.current.typingMatches).toBeNull();

    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
    const { result } = renderChat();
    await act(() => result.current.sendMessage('soup'));
    vi.mocked(getAllPublishedRecipes).mockResolvedValue(window200 as never);
    await type(result, 'banana bread');
    await pause();
    expect(result.current.typingMatches).toBeNull();

    config.firebase = false;
    const local = renderChat();
    await type(local.result, 'banana bread');
    await pause();
    expect(local.result.current.typingMatches).toBeNull();
    expect(getAllPublishedRecipes).toHaveBeenCalledTimes(1);
  });
});

describe('useRecipeChat sends the stored avoids with a new session (RL-233)', () => {
  const session = vi.fn();
  const profile = { avoids: ['Peanuts', 'Pork'], hidden: [], askedAt: null };

  beforeEach(() => {
    session.mockResolvedValue(generated('Soup'));
    vi.mocked(createRecipeChat).mockReturnValue({ sendMessage: session });
    vi.mocked(createVariationChat).mockReturnValue({ sendMessage: session });
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
    getTasteProfile.mockResolvedValue(profile);
  });

  it('reads the profile once when the session opens and passes the avoids to it', async () => {
    const { result } = renderChat();

    await act(() => result.current.sendMessage('satay'));
    getTasteProfile.mockResolvedValue({ ...profile, avoids: ['Fish'] });
    await act(() => result.current.sendMessage('make it quicker'));

    expect(getTasteProfile).toHaveBeenCalledTimes(1);
    expect(getTasteProfile).toHaveBeenCalledWith(fakeUser.uid);
    expect(createRecipeChat).toHaveBeenCalledTimes(1);
    expect(createRecipeChat).toHaveBeenCalledWith(['Peanuts', 'Pork']);
    expect(session).toHaveBeenCalledTimes(2);
  });

  it('passes them to a variation session too', async () => {
    const { searchPublishedVariations } = await import('../services/firestore');
    vi.mocked(searchPublishedVariations).mockResolvedValue([]);
    const parent = makeRecipe({ id: 'p1' });
    const { result } = renderHook(() => useRecipeChat(parent), { wrapper });

    await act(() => result.current.sendMessage('make it quicker'));

    expect(createVariationChat).toHaveBeenCalledWith(parent, ['Peanuts', 'Pork']);
  });

  it('reads nothing for an unverified user and generates without avoids', async () => {
    const unverified = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={{ user: { ...fakeUser, emailVerified: false } } as AuthContextType}>
        {children}
      </AuthContext.Provider>
    );
    const { result } = renderHook(() => useRecipeChat(), { wrapper: unverified });

    await act(() => result.current.sendMessage('satay'));

    expect(getTasteProfile).not.toHaveBeenCalled();
    expect(createRecipeChat).toHaveBeenCalledWith([]);
  });

  it('leaves dropped avoids out of this chat only, and ignores drops that are not stored avoids (RL-235)', async () => {
    const dropped = renderHook(() => useRecipeChat(undefined, undefined, ['peanuts', 'Shellfish', 7]), { wrapper });
    await act(() => dropped.result.current.sendMessage('satay'));
    expect(createRecipeChat).toHaveBeenLastCalledWith(['Pork']);

    const fresh = renderChat();
    await act(() => fresh.result.current.sendMessage('satay'));
    expect(createRecipeChat).toHaveBeenLastCalledWith(['Peanuts', 'Pork']);
    expect(JSON.stringify(reportError.mock.calls)).not.toContain('Peanuts');
  });

  it('starts the read when the hook mounts, before any send', async () => {
    renderChat();
    await act(async () => {});

    expect(getTasteProfile).toHaveBeenCalledTimes(1);
    expect(createRecipeChat).not.toHaveBeenCalled();
  });

  it('a failed read is reported, generates without avoids, shows the notice and is retried on the next send', async () => {
    getTasteProfile.mockRejectedValueOnce(new Error('Reading your taste profile timed out'));
    const { result } = renderChat();

    await act(() => result.current.sendMessage('satay'));

    expect(createRecipeChat).toHaveBeenLastCalledWith([]);
    expect(result.current.latestRecipe?.title).toBe('Soup');
    expect(result.current.avoidsUnavailable).toBe(true);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'taste-avoids');

    await act(() => result.current.sendMessage('make it quicker'));

    expect(getTasteProfile).toHaveBeenCalledTimes(2);
    expect(createRecipeChat).toHaveBeenCalledTimes(2);
    expect(createRecipeChat).toHaveBeenLastCalledWith(['Peanuts', 'Pork']);
    expect(result.current.avoidsUnavailable).toBe(false);

    await act(() => result.current.sendMessage('less salt'));
    expect(createRecipeChat).toHaveBeenCalledTimes(2);
  });

  it('no profile document is not a failure: no notice, no report', async () => {
    getTasteProfile.mockResolvedValue({ avoids: [], hidden: [], askedAt: null });
    const { result } = renderChat();

    await act(() => result.current.sendMessage('satay'));

    expect(createRecipeChat).toHaveBeenCalledWith([]);
    expect(result.current.avoidsUnavailable).toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('permission denied (rules not deployed) counts as no avoids: no notice, no report', async () => {
    getTasteProfile.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { result } = renderChat();

    await act(() => result.current.sendMessage('satay'));
    await act(() => result.current.sendMessage('less salt'));

    expect(createRecipeChat).toHaveBeenCalledTimes(1);
    expect(createRecipeChat).toHaveBeenCalledWith([]);
    expect(result.current.avoidsUnavailable).toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('no telemetry or analytics call carries avoid text', async () => {
    const { result } = renderChat();
    await act(() => result.current.sendMessage('satay'));
    session.mockRejectedValueOnce(new Error('model failed'));
    await act(() => result.current.sendMessage('again'));
    await act(() => result.current.saveRecipe());

    const sent = JSON.stringify([
      ...reportError.mock.calls.map((c) => [String(c[0]), c[1]]),
      ...vi.mocked(trackRecipeCreated).mock.calls,
    ]);
    expect(reportError).toHaveBeenCalled();
    expect(trackRecipeCreated).toHaveBeenCalled();
    expect(sent.toLowerCase()).not.toMatch(/peanut|pork/);
  });
});

describe('useRecipeChat first-time avoids card (RL-234)', () => {
  const session = vi.fn();
  beforeEach(() => {
    session.mockResolvedValue(generated('Soup'));
    vi.mocked(createRecipeChat).mockReturnValue({ sendMessage: session });
    vi.mocked(getAllPublishedRecipes).mockResolvedValue([]);
  });

  it('asks once: shown when nothing is stored and never asked, from the one read', async () => {
    const { result } = renderChat();
    await act(async () => {});
    expect(result.current.askAvoids).toBe(true);
    expect(getTasteProfile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['avoids exist', { avoids: ['Pork'], hidden: [], askedAt: null }],
    ['already asked', { avoids: [], hidden: [], askedAt: 5 }],
  ])('is hidden when %s', async (_n, profile) => {
    getTasteProfile.mockResolvedValue(profile);
    const { result } = renderChat();
    await act(async () => {});
    expect(result.current.askAvoids).toBe(false);
  });

  it('is hidden when the read failed', async () => {
    getTasteProfile.mockRejectedValue(new Error('offline'));
    const { result } = renderChat();
    await act(async () => {});
    expect(result.current.askAvoids).toBe(false);
  });

  it('Save stores avoids and askedAt, hides the card, and the first generation uses them', async () => {
    saveTasteProfile.mockImplementation(async (_uid, update) => ({
      hidden: [],
      ...update({ avoids: [], hidden: [], askedAt: null }),
    }));
    const { result } = renderChat();
    await act(async () => {});
    await act(() => result.current.answerAsk(['Pork', 'pork', 'Dairy']));

    expect(saveTasteProfile).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function));
    expect(saveTasteProfile.mock.results[0].value).resolves.toMatchObject({ avoids: ['Pork', 'Dairy'], askedAt: expect.any(Number) });
    expect(result.current.askAvoids).toBe(false);
    await act(() => result.current.sendMessage('satay'));
    expect(createRecipeChat).toHaveBeenCalledWith(['Pork', 'Dairy']);
    expect(getTasteProfile).toHaveBeenCalledTimes(1);
  });

  it('Skip stores askedAt only', async () => {
    saveTasteProfile.mockImplementation(async (_uid, update) => ({ avoids: [], hidden: [], ...update({ avoids: [], hidden: [], askedAt: null }) }));
    const { result } = renderChat();
    await act(async () => {});
    await act(() => result.current.answerAsk([]));
    expect(await saveTasteProfile.mock.results[0].value).toMatchObject({ avoids: [], askedAt: expect.any(Number) });
    expect(result.current.askAvoids).toBe(false);
  });

  it('a failed save rejects and keeps the card', async () => {
    saveTasteProfile.mockRejectedValue(new Error('boom'));
    const { result } = renderChat();
    await act(async () => {});
    await act(async () => {
      await expect(result.current.answerAsk(['Pork'])).rejects.toThrow('boom');
    });
    expect(result.current.askAvoids).toBe(true);
  });
});
