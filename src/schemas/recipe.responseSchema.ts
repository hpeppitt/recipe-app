import { Schema } from 'firebase/ai';

/**
 * The recipe shape as the *model config* sees it, using Firebase AI Logic's
 * `Schema` builders.
 *
 * Why this exists (RISK-1 mitigation 1): prompts are built client-side, so anyone
 * running the app can send arbitrary text through the project's Gemini quota.
 * App Check raises the bar but does not remove it, and the decision to stay off
 * the Blaze plan means there is no server hop where rate limiting could live. A
 * response schema does not stop the request, but it narrows what a misused one
 * can *return* to "a valid recipe", which removes most of the value in trying.
 *
 * It should also retire most of the repair work in `parseRecipeJson`. That repair
 * stays anyway — see the note there.
 *
 * This is the single source of truth for the shape. `lib/prompts.ts` stringifies
 * it into the system prompt rather than keeping a second hand-written copy, which
 * is what it used to do: two copies of a schema drift, and the one in the prompt
 * is the one nothing would catch.
 *
 * Zod (`recipe.schema.ts`) remains the gate on the way in. A model config is a
 * request hint, not a guarantee, so both layers are deliberate rather than
 * redundant.
 */

const ingredientProperties = {
  // Nullable rather than absent: an ingredient like "salt to taste" genuinely
  // has no amount, and null says that where 0 would be a claim.
  amount: Schema.number({ nullable: true }),
  unit: Schema.string({ nullable: true }),
  name: Schema.string(),
  notes: Schema.string({ nullable: true }),
  group: Schema.string({
    nullable: true,
    description: 'Subgroup heading, e.g. "For the sauce". Null when the recipe has no subgroups.',
  }),
};

const ingredientSchema = Schema.object({ properties: ingredientProperties });

const instructionSchema = Schema.object({
  properties: {
    step: Schema.integer({ description: 'Sequential, starting at 1.' }),
    text: Schema.string(),
    group: Schema.string({ nullable: true }),
  },
});

const nutritionSchema = (nullable: boolean) => Schema.object({
  nullable,
  description: 'Per-serving estimates, not totals for the dish.',
  properties: {
    calories: Schema.number({ description: 'kcal per serving.' }),
    protein: Schema.number({ description: 'Grams per serving.' }),
    carbs: Schema.number({ description: 'Grams per serving.' }),
    fat: Schema.number({ description: 'Grams per serving.' }),
  },
});

const recipeProperties = {
  title: Schema.string(),
  description: Schema.string(),
  ingredients: Schema.array({ items: ingredientSchema }),
  instructions: Schema.array({ items: instructionSchema }),
  notes: Schema.array({
    items: Schema.string(),
    description: 'Technique, storage or variation tips.',
  }),
  prepTime: Schema.integer({ description: 'Minutes.' }),
  cookTime: Schema.integer({ description: 'Minutes.' }),
  totalTime: Schema.integer({ description: 'Minutes.' }),
  servings: Schema.integer(),
  difficulty: Schema.enumString({ enum: ['easy', 'medium', 'hard'] }),
  tags: Schema.array({
    items: Schema.string(),
    description: 'Cuisine, dietary and meal-type labels.',
  }),
  emoji: Schema.string({ description: 'Exactly one food emoji, nothing else.' }),
  nutrition: nutritionSchema(false),
};

export const RECIPE_RESPONSE_SCHEMA = Schema.object({ properties: recipeProperties });

/**
 * The link-import shape (RL-185): the recipe shape plus a per-ingredient
 * `uncertain` flag, so an amount the page does not make clear comes back as
 * `amount: null, uncertain: true` instead of a guess. Nutrition is nullable
 * because a page rarely states it and the import must not invent it.
 */
export const IMPORT_RESPONSE_SCHEMA = Schema.object({
  properties: {
    ...recipeProperties,
    ingredients: Schema.array({
      items: Schema.object({
        properties: {
          ...ingredientProperties,
          uncertain: Schema.boolean({
            description: 'True when the page does not make the amount clear; amount is then null.',
          }),
        },
      }),
    }),
    nutrition: nutritionSchema(true),
  },
});

/**
 * The same schema as text, for the system prompt.
 *
 * `Schema` serialises to the wire JSON, so this stays in step with the model
 * config by construction. Kept in the prompt as well as the config because the
 * config constrains the shape while the prompt is what explains the *intent* of
 * fields like `group` and per-serving nutrition.
 */
export function recipeSchemaAsPromptText(): string {
  return JSON.stringify(RECIPE_RESPONSE_SCHEMA, null, 2);
}
