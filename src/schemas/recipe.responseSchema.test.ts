import { describe, it, expect } from 'vitest';
import { RECIPE_RESPONSE_SCHEMA, recipeSchemaAsPromptText } from './recipe.responseSchema';
import { GeneratedRecipeSchema } from './recipe.schema';

/**
 * The response schema and the Zod schema describe the same object for different
 * audiences — one tells the model what to produce, the other refuses to trust it.
 * They are hand-written in two places because neither library can generate the
 * other (`zod-to-json-schema` is incompatible with Zod v4), so the thing worth
 * testing is that they have not drifted apart.
 */
describe('RECIPE_RESPONSE_SCHEMA', () => {
  const wire = JSON.parse(JSON.stringify(RECIPE_RESPONSE_SCHEMA)) as {
    type: string;
    properties: Record<string, { type?: string; nullable?: boolean; enum?: string[] }>;
  };

  it('serialises to an object schema', () => {
    expect(wire.type).toBe('object');
  });

  it('covers exactly the keys Zod expects, no more and no fewer', () => {
    const zodKeys = Object.keys(GeneratedRecipeSchema.shape).sort();
    expect(Object.keys(wire.properties).sort()).toEqual(zodKeys);
  });

  it('constrains difficulty to the three values Zod accepts', () => {
    expect(wire.properties.difficulty.enum).toEqual(['easy', 'medium', 'hard']);
  });

  it('marks the genuinely-absent ingredient fields nullable', () => {
    const ingredient = (
      wire.properties.ingredients as unknown as {
        items: { properties: Record<string, { nullable?: boolean }> };
      }
    ).items;
    // "salt to taste" has no amount, and null says so where 0 would be a claim.
    expect(ingredient.properties.amount.nullable).toBe(true);
    expect(ingredient.properties.unit.nullable).toBe(true);
    expect(ingredient.properties.notes.nullable).toBe(true);
    expect(ingredient.properties.group.nullable).toBe(true);
    // The name is the one field an ingredient cannot lack.
    expect(ingredient.properties.name.nullable).toBeFalsy();
  });

  it('accepts a recipe shaped by the schema through the Zod gate', () => {
    // Belt-and-braces: the model config is a hint, so anything it would produce
    // must still satisfy the validator that actually guards the app.
    const candidate = {
      title: 'Test Loaf',
      description: 'A loaf.',
      ingredients: [
        { amount: 500, unit: 'g', name: 'flour', notes: null, group: null },
        { amount: null, unit: null, name: 'salt', notes: 'to taste', group: null },
      ],
      instructions: [{ step: 1, text: 'Mix.', group: null }],
      notes: ['Keeps three days.'],
      prepTime: 10,
      cookTime: 40,
      totalTime: 50,
      servings: 8,
      difficulty: 'easy',
      tags: ['bread'],
      emoji: '🍞',
      nutrition: { calories: 210, protein: 6, carbs: 40, fat: 2 },
    };
    expect(() => GeneratedRecipeSchema.parse(candidate)).not.toThrow();
  });
});

describe('recipeSchemaAsPromptText', () => {
  it('is valid JSON, so the prompt cannot embed a malformed schema', () => {
    expect(() => JSON.parse(recipeSchemaAsPromptText())).not.toThrow();
  });

  it('stays in step with the model config by construction', () => {
    expect(JSON.parse(recipeSchemaAsPromptText())).toEqual(
      JSON.parse(JSON.stringify(RECIPE_RESPONSE_SCHEMA))
    );
  });
});
