import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRecipe } from '../test/factories';

const { chatSend, captureAiGeneration } = vi.hoisted(() => ({
  chatSend: vi.fn(),
  captureAiGeneration: vi.fn(),
}));
vi.mock('firebase/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/ai')>()),
  getAI: vi.fn(),
  GoogleAIBackend: class {},
  getGenerativeModel: () => ({ startChat: () => ({ sendMessage: chatSend }) }),
}));
vi.mock('./firebase', () => ({ firebaseApp: {} }));
vi.mock('./analytics', () => ({ captureAiGeneration }));

import { createRecipeChat } from './gemini';

function modelReply() {
  const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } =
    makeRecipe({ title: 'Soup' });
  return { response: { text: () => JSON.stringify(rest) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  chatSend.mockResolvedValue(modelReply());
});

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
