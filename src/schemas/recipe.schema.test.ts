import { describe, it, expect } from 'vitest';
import { GeneratedRecipeSchema } from './recipe.schema';
import { RECIPE_EMOJI_FALLBACK } from '../lib/emoji';

const base = {
  title: 't', description: 'd', servings: 1, prepTime: 1, cookTime: 1, totalTime: 2,
  difficulty: 'easy', ingredients: [], instructions: [], notes: [], tags: [],
};

describe('GeneratedRecipeSchema.emoji', () => {
  it('keeps the first of two emoji', () => {
    expect(GeneratedRecipeSchema.parse({ ...base, emoji: '🍞🧈' }).emoji).toBe('🍞');
  });
  it('falls back for text without failing the parse', () => {
    expect(GeneratedRecipeSchema.parse({ ...base, emoji: 'bread' }).emoji).toBe(RECIPE_EMOJI_FALLBACK);
  });
});
