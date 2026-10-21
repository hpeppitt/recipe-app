import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRecipe } from '../test/factories';

const { chatSend, generateContent, getGenerativeModel, captureAiGeneration } = vi.hoisted(() => {
  const chatSend = vi.fn();
  const generateContent = vi.fn();
  return {
    chatSend,
    generateContent,
    getGenerativeModel: vi.fn(() => ({ startChat: () => ({ sendMessage: chatSend }), generateContent })),
    captureAiGeneration: vi.fn(),
  };
});
vi.mock('firebase/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/ai')>()),
  getAI: vi.fn(),
  GoogleAIBackend: class {},
  getGenerativeModel,
}));
vi.mock('./firebase', () => ({ firebaseApp: {} }));
vi.mock('./analytics', () => ({ captureAiGeneration }));

import { createRecipeChat, importRecipeFromUrl, IMPORT_TIMEOUT_MS } from './gemini';
import { IMPORT_RESPONSE_SCHEMA } from '../schemas/recipe.responseSchema';
import { IMPORT_SYSTEM_PROMPT } from '../lib/prompts';
import { IMPORT_ERROR_MESSAGE } from '../lib/linkImport';

function modelReply() {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } =
    makeRecipe({ title: 'Soup' });
  return { response: { text: () => JSON.stringify(rest) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  chatSend.mockResolvedValue(modelReply());
  generateContent.mockResolvedValue(importReply([{ amount: 2, unit: 'cups', name: 'flour', notes: null, group: null, uncertain: false }]));
});

function importReply(ingredients: unknown[]) {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } =
    makeRecipe({ title: 'Loaf', instructions: [{ step: 1, text: 'Bake.', group: null }] });
  return { response: { text: () => JSON.stringify({ ...rest, ingredients, nutrition: null }) } };
}

describe('ChatSession.sendMessage', () => {
  it('sends the plain string, exactly as before, when there are no images', async () => {
    const recipe = await createRecipeChat().sendMessage('soup please');

    expect(recipe.title).toBe('Soup');
    expect(chatSend).toHaveBeenCalledTimes(1);
    expect(chatSend.mock.calls[0]).toEqual(['soup please']);
  });

  it('treats an empty image list as no images', async () => {
    await createRecipeChat().sendMessage('soup please', []);

    expect(chatSend.mock.calls[0]).toEqual(['soup please']);
  });

  it('sends the text and every image as inline parts in one call', async () => {
    await createRecipeChat().sendMessage('what can I cook?', [
      { mimeType: 'image/jpeg', base64: 'AAAA' },
      { mimeType: 'image/jpeg', base64: 'BBBB' },
    ]);

    expect(chatSend).toHaveBeenCalledTimes(1);
    expect(chatSend.mock.calls[0]).toEqual([
      [
        'what can I cook?',
        { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
        { inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } },
      ],
    ]);
  });

  it('reports the same analytics fields with images and nothing image-derived', async () => {
    await createRecipeChat().sendMessage('x', [{ mimeType: 'image/jpeg', base64: 'AAAA' }]);

    expect(captureAiGeneration).toHaveBeenCalledTimes(1);
    const fields = captureAiGeneration.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(fields).sort()).toEqual(['latency', 'model', 'sessionId', 'traceId']);
    expect(JSON.stringify(fields)).not.toContain('AAAA');
  });
});

describe('importRecipeFromUrl', () => {
  const PAGE = 'https://www.seriouseats.com/secret-family/loaf?ref=abc';

  it('calls the model once with the URL context tool, the import schema and a 30 s bound', async () => {
    const draft = await importRecipeFromUrl(PAGE);

    expect(draft.error).toBeNull();
    expect(draft.recipe?.title).toBe('Loaf');
    expect(draft.recipe?.importedFrom).toBe(PAGE);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0]).toEqual([PAGE]);
    const [, params, requestOptions] = getGenerativeModel.mock.calls[0] as unknown as [
      unknown,
      { tools: unknown; systemInstruction: string; generationConfig: { responseSchema: unknown; responseMimeType: string } },
      { timeout: number },
    ];
    expect(params.tools).toEqual([{ urlContext: {} }]);
    expect(params.systemInstruction).toBe(IMPORT_SYSTEM_PROMPT);
    expect(params.generationConfig.responseSchema).toBe(IMPORT_RESPONSE_SCHEMA);
    expect(params.generationConfig.responseMimeType).toBe('application/json');
    expect(requestOptions.timeout).toBe(IMPORT_TIMEOUT_MS);
    expect(IMPORT_TIMEOUT_MS).toBe(30_000);
  });

  it('adds https:// before calling the model', async () => {
    await importRecipeFromUrl('  seriouseats.com/loaf ');
    expect(generateContent.mock.calls[0]).toEqual(['https://seriouseats.com/loaf']);
  });

  it('returns the uncertain count from the draft', async () => {
    generateContent.mockResolvedValue(
      importReply([
        { amount: null, unit: 'g', name: 'butter', notes: null, group: null, uncertain: true },
        { amount: 1, unit: null, name: 'egg', notes: null, group: null, uncertain: false },
      ])
    );
    const draft = await importRecipeFromUrl(PAGE);
    expect(draft.uncertainCount).toBe(1);
  });

  it('maps a timeout, a network error and an unreadable reply to the one message', async () => {
    const failed = { recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    generateContent.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
    expect(await importRecipeFromUrl(PAGE)).toEqual(failed);

    generateContent.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await importRecipeFromUrl(PAGE)).toEqual(failed);

    generateContent.mockResolvedValueOnce({ response: { text: () => 'Sorry, I cannot read that.' } });
    expect(await importRecipeFromUrl(PAGE)).toEqual(failed);
  });

  it('refuses a private URL without calling the model', async () => {
    expect(await importRecipeFromUrl('http://localhost:5173/x')).toEqual({
      recipe: null,
      uncertainCount: 0,
      error: IMPORT_ERROR_MESSAGE,
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('sends analytics without any part of the URL, and logs only the host on failure', async () => {
    await importRecipeFromUrl(PAGE);
    const fields = captureAiGeneration.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(fields).sort()).toEqual(['latency', 'model', 'sessionId', 'traceId']);
    expect(JSON.stringify(fields)).not.toContain('seriouseats');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    generateContent.mockRejectedValueOnce(new TypeError(`fetch failed for ${PAGE}`));
    await importRecipeFromUrl(PAGE);
    expect(warn.mock.calls[0]).toEqual(['Link import failed for', 'seriouseats.com', 'TypeError']);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('secret-family');
  });
});
