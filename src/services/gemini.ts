import { GoogleGenAI } from '@google/genai';
import { GeneratedRecipeSchema } from '../schemas/recipe.schema';
import { RECIPE_SYSTEM_PROMPT, getVariationSystemPrompt } from '../lib/prompts';
import type { GeneratedRecipe } from '../types/api';
import type { Recipe } from '../types/recipe';

function getClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

export async function testConnection(apiKey: string): Promise<boolean> {
  try {
    const ai = getClient(apiKey);
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Say "ok"',
    });
    return !!response.text;
  } catch {
    return false;
  }
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

export function createRecipeChat(apiKey: string): ChatSession {
  const ai = getClient(apiKey);
  const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

  return {
    async sendMessage(message: string): Promise<GeneratedRecipe> {
      history.push({ role: 'user', parts: [{ text: message }] });

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        config: {
          systemInstruction: RECIPE_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
        },
        contents: history,
      });

      const text = response.text ?? '';
      history.push({ role: 'model', parts: [{ text }] });

      return parseRecipeJson(text);
    },
  };
}

export function createVariationChat(apiKey: string, parentRecipe: Recipe): ChatSession {
  const ai = getClient(apiKey);
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
  const systemPrompt = getVariationSystemPrompt(parentJson);
  const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

  return {
    async sendMessage(message: string): Promise<GeneratedRecipe> {
      history.push({ role: 'user', parts: [{ text: message }] });

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        },
        contents: history,
      });

      const text = response.text ?? '';
      history.push({ role: 'model', parts: [{ text }] });

      return parseRecipeJson(text);
    },
  };
}
