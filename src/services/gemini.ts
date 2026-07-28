import { getAI, getGenerativeModel, GoogleAIBackend, type ChatSession as AIChatSession } from 'firebase/ai';
import { GeneratedRecipeSchema } from '../schemas/recipe.schema';
import { RECIPE_SYSTEM_PROMPT, getVariationSystemPrompt } from '../lib/prompts';
import { firebaseApp } from './firebase';
import type { GeneratedRecipe } from '../types/api';
import type { Recipe } from '../types/recipe';

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
    // Kept as prompt-requested JSON rather than a responseSchema for now — see
    // RISK-1 mitigation 1 in AUDIT.md. The schema lives in lib/prompts.ts as a
    // string and converting it to the SDK's Schema builders is untested work.
    generationConfig: { responseMimeType: 'application/json' },
  });
}

export interface ChatSession {
  sendMessage: (message: string) => Promise<GeneratedRecipe>;
}

function parseRecipeJson(text: string): GeneratedRecipe {
  // Strip markdown code fences if present
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  // Remove trailing commas before } or ] (common Gemini quirk)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(cleaned);
  return GeneratedRecipeSchema.parse(parsed);
}

/** Wraps an AI Logic chat so multi-turn history is managed by the SDK. */
function toChatSession(chat: AIChatSession): ChatSession {
  return {
    async sendMessage(message: string): Promise<GeneratedRecipe> {
      const result = await chat.sendMessage(message);
      return parseRecipeJson(result.response.text());
    },
  };
}

export function createRecipeChat(): ChatSession {
  return toChatSession(buildModel(RECIPE_SYSTEM_PROMPT).startChat());
}

export function createVariationChat(parentRecipe: Recipe): ChatSession {
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

  return toChatSession(buildModel(getVariationSystemPrompt(parentJson)).startChat());
}
