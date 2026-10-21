import { getAI, getGenerativeModel, GoogleAIBackend, type ChatSession as AIChatSession } from 'firebase/ai';
import { GeneratedRecipeSchema } from '../schemas/recipe.schema';
import { IMPORT_RESPONSE_SCHEMA, RECIPE_RESPONSE_SCHEMA } from '../schemas/recipe.responseSchema';
import { IMPORT_SYSTEM_PROMPT, PHOTO_IMPORT_SYSTEM_PROMPT, RECIPE_SYSTEM_PROMPT, getVariationSystemPrompt, withAvoids } from '../lib/prompts';
import {
  IMPORT_ERROR_MESSAGE,
  PHOTO_IMPORT_ERROR_MESSAGE,
  PHOTO_SOURCE,
  importHost,
  normalizeImportUrl,
  toImportDraft,
  type ImportDraft,
} from '../lib/linkImport';
import { firebaseApp } from './firebase';
import { captureAiGeneration } from './analytics';
import type { GeneratedRecipe } from '../types/api';
import type { Recipe } from '../types/recipe';
import { MAX_IMAGES_PER_MESSAGE, redactInlineData, type ImageAttachment } from '../lib/imageAttachments';
import { RECEIPT_ERROR_MESSAGE, RECEIPT_SYSTEM_PROMPT, parseReceiptItems } from '../lib/receipt';
import { RECEIPT_RESPONSE_SCHEMA } from '../schemas/receipt.responseSchema';
import { reportError } from './telemetry';

// gemini-2.0-flash was shut down on 2026-06-01 and returns 404. Keep this in
// step with the Firebase AI Logic supported-models list; a retired model breaks
// generation completely and the only symptom is a 404 in the console.
const MODEL = 'gemini-3.6-flash';

/**
 * Generation goes through Firebase AI Logic rather than calling Gemini directly.
 *
 * The key never reaches the browser: AI Logic proxies the request and holds a
 * Gemini key that Firebase provisions and manages server-side. Previously the app
 * asked each user for their own key and stored it in localStorage, which also
 * meant `getApiKey()` was the gate on the whole create flow.
 *
 * App Check is enforced on this path (see services/firebase.ts), so the request is
 * rejected unless it carries a valid app attestation.
 */
function buildModel(systemInstruction: string) {
  if (!firebaseApp) {
    // Local-only mode has no Firebase project, so there is no proxy to call.
    throw new Error('Firebase is not configured, so recipes cannot be generated.');
  }
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: MODEL,
    systemInstruction,
    // RISK-1 mitigation 1: the shape is enforced at the model layer, not merely
    // asked for in the prompt. Prompts are still built client-side, so this does
    // not stop a misused request — it narrows what one can return to "a valid
    // recipe", which removes most of the point of trying.
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_RESPONSE_SCHEMA,
    },
  });
}

export interface ChatSession {
  /** Photos ride in the same request as the text: one send is one AI Logic call. */
  sendMessage: (message: string, images?: ImageAttachment[]) => Promise<GeneratedRecipe>;
}

function parseRecipeJson(text: string): GeneratedRecipe {
  // The repair below should now be dead code: with a responseSchema on the model
  // config, the response is constrained JSON rather than JSON-in-prose. It stays
  // because it costs two regexes on a string that is already in memory, and
  // because a model config is a request hint — if a future model or a
  // rate-limited fallback ever returns fenced output again, this is the
  // difference between a working generation and a parse error the user sees.

  // Strip markdown code fences if present
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  // Remove trailing commas before } or ] (common Gemini quirk)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(cleaned);
  // Zod is the actual gate. The model config narrows what arrives; this is what
  // refuses to trust it.
  return GeneratedRecipeSchema.parse(parsed);
}

/** Wraps an AI Logic chat so multi-turn history is managed by the SDK. */
function toChatSession(chat: AIChatSession): ChatSession {
  const sessionId = crypto.randomUUID();

  return {
    async sendMessage(message: string, images?: ImageAttachment[]): Promise<GeneratedRecipe> {
      const startedAt = performance.now();
      const result = await chat.sendMessage(
        images?.length
          ? [message, ...images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } }))]
          : message
      );
      const output = result.response.text();
      const recipe = parseRecipeJson(output);

      captureAiGeneration({
        model: MODEL,
        sessionId,
        traceId: crypto.randomUUID(),
        latency: (performance.now() - startedAt) / 1000,
      });

      return recipe;
    },
  };
}

/** `avoids` are the user's stored avoids (RL-233); they shape the system prompt only and never reach analytics. */
export function createRecipeChat(avoids: readonly string[] = []): ChatSession {
  return toChatSession(buildModel(withAvoids(RECIPE_SYSTEM_PROMPT, avoids)).startChat());
}

export function createVariationChat(parentRecipe: Recipe, avoids: readonly string[] = []): ChatSession {
  const parentJson = JSON.stringify({
    title: parentRecipe.title,
    description: parentRecipe.description,
    ingredients: parentRecipe.ingredients,
    instructions: parentRecipe.instructions,
    notes: parentRecipe.notes,
    prepTime: parentRecipe.prepTime,
    cookTime: parentRecipe.cookTime,
    totalTime: parentRecipe.totalTime,
    servings: parentRecipe.servings,
    difficulty: parentRecipe.difficulty,
    tags: parentRecipe.tags,
    emoji: parentRecipe.emoji,
  });

  return toChatSession(buildModel(withAvoids(getVariationSystemPrompt(parentJson), avoids)).startChat());
}

/** A link import is one AI Logic request; past this the page counts as unreadable. */
export const IMPORT_TIMEOUT_MS = 30_000;

/**
 * Reads the recipe on one public page through AI Logic's URL context tool (RL-185).
 *
 * A one-shot call, not a chat: nothing here touches chat history or photos.
 * Every failure, including a refused URL, resolves to the same message rather
 * than throwing, so the URL never reaches an error report. Analytics get the
 * same fields as a generation and no part of the URL.
 */
export async function importRecipeFromUrl(input: string): Promise<ImportDraft> {
  const url = normalizeImportUrl(input);
  if (!url) return { recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE };
  try {
    if (!firebaseApp) throw new Error('Firebase is not configured, so recipes cannot be imported.');
    const startedAt = performance.now();
    const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(
      ai,
      {
        model: MODEL,
        systemInstruction: IMPORT_SYSTEM_PROMPT,
        tools: [{ urlContext: {} }],
        // Whether AI Logic accepts responseSchema alongside URL context is unconfirmed
        // (backlog/DECISIONS.md, RL-185). The prompt asks for the same JSON, so
        // toImportDraft still validates if the schema has to come off.
        generationConfig: { responseMimeType: 'application/json', responseSchema: IMPORT_RESPONSE_SCHEMA },
      },
      { timeout: IMPORT_TIMEOUT_MS }
    );
    const result = await model.generateContent(url);
    const draft = toImportDraft(result.response.text(), url);
    captureAiGeneration({
      model: MODEL,
      sessionId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      latency: (performance.now() - startedAt) / 1000,
    });
    return draft;
  } catch (err) {
    // Host and error name only: the path can identify what someone reads, and SDK
    // error messages can embed the full URL. Console is not sent to telemetry.
    console.warn('Link import failed for', importHost(url), err instanceof Error ? err.name : 'error');
    return { recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE };
  }
}

/** A photo import is one AI Logic request with up to three photos, so it gets longer than a link. */
export const PHOTO_IMPORT_TIMEOUT_MS = 45_000;

/**
 * Reads the recipe in up to three downscaled photos of a page or card (RL-251).
 *
 * As `readReceipt`, the photos live only in this request: not stored, not in
 * analytics, and any error is redacted before it is reported. Every failure
 * resolves to `PHOTO_IMPORT_ERROR_MESSAGE` rather than throwing.
 */
export async function importRecipeFromPhotos(photos: ImageAttachment[]): Promise<ImportDraft> {
  const failed: ImportDraft = { recipe: null, uncertainCount: 0, error: PHOTO_IMPORT_ERROR_MESSAGE };
  if (!photos.length || photos.length > MAX_IMAGES_PER_MESSAGE) return failed;
  try {
    if (!firebaseApp) throw new Error('Firebase is not configured, so recipes cannot be imported.');
    const startedAt = performance.now();
    const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(
      ai,
      {
        model: MODEL,
        systemInstruction: PHOTO_IMPORT_SYSTEM_PROMPT,
        generationConfig: { responseMimeType: 'application/json', responseSchema: IMPORT_RESPONSE_SCHEMA },
      },
      { timeout: PHOTO_IMPORT_TIMEOUT_MS }
    );
    const result = await model.generateContent([
      'Read the recipe in these photos.',
      ...photos.map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.base64 } })),
    ]);
    const draft = toImportDraft(result.response.text(), PHOTO_SOURCE);
    captureAiGeneration({
      model: MODEL,
      sessionId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      latency: (performance.now() - startedAt) / 1000,
    });
    // The reply is not logged: it is the page's text.
    return draft.recipe ? draft : failed;
  } catch (err) {
    // A new Error from the redacted message only: no cause, stack or SDK fields that may echo a photo.
    const redacted = redactInlineData(err);
    const safe = new Error(redacted instanceof Error ? redacted.message : 'Photo import failed');
    safe.name = err instanceof Error ? err.name : 'Error';
    console.error('Photo import failed', safe.name, safe.message);
    reportError(safe, 'import-photo');
    return failed;
  }
}

/** A receipt read is one AI Logic request (RL-241). */
export const RECEIPT_TIMEOUT_MS = 30_000;

/**
 * Reads the food and drink names off one downscaled receipt photo (RL-241).
 *
 * The photo lives only in this request: it is not stored, not in analytics, and
 * any error is redacted before it is reported. Every failure, an empty list
 * included, throws `RECEIPT_ERROR_MESSAGE`.
 */
export async function readReceipt(photo: ImageAttachment): Promise<string[]> {
  let items: string[];
  try {
    if (!firebaseApp) throw new Error('Firebase is not configured, so receipts cannot be read.');
    const startedAt = performance.now();
    const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(
      ai,
      {
        model: MODEL,
        systemInstruction: RECEIPT_SYSTEM_PROMPT,
        generationConfig: { responseMimeType: 'application/json', responseSchema: RECEIPT_RESPONSE_SCHEMA },
      },
      { timeout: RECEIPT_TIMEOUT_MS }
    );
    const result = await model.generateContent([
      'Read this receipt.',
      { inlineData: { mimeType: photo.mimeType, data: photo.base64 } },
    ]);
    try {
      items = parseReceiptItems(result.response.text());
    } catch {
      // Fixed message: the reply may hold receipt text, which must not reach the console or a report.
      throw new Error('Receipt reply was not valid');
    }
    captureAiGeneration({
      model: MODEL,
      sessionId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      latency: (performance.now() - startedAt) / 1000,
    });
  } catch (err) {
    // A new Error from the redacted message only: no cause, stack or SDK fields that may echo the photo.
    const redacted = redactInlineData(err);
    const safe = new Error(redacted instanceof Error ? redacted.message : 'Receipt read failed');
    safe.name = err instanceof Error ? err.name : 'Error';
    console.error('Receipt read failed', safe.name, safe.message);
    reportError(safe, 'read-receipt');
    throw new Error(RECEIPT_ERROR_MESSAGE);
  }
  if (!items.length) throw new Error(RECEIPT_ERROR_MESSAGE);
  return items;
}
