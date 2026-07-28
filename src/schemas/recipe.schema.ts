import { z } from 'zod';

export const IngredientSchema = z.object({
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  name: z.string(),
  notes: z.string().nullable(),
  group: z.string().nullable(),
});

export const InstructionSchema = z.object({
  step: z.number(),
  text: z.string(),
  group: z.string().nullable(),
});

/**
 * Per-serving macros.
 *
 * Optional throughout: every recipe generated before this field existed has none,
 * and an import of an older export must still validate. Absent is rendered as
 * "no data", never as zero — "0 calories" is a claim, not a gap.
 */
export const NutritionSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const GeneratedRecipeSchema = z.object({
  title: z.string(),
  description: z.string(),
  ingredients: z.array(IngredientSchema),
  instructions: z.array(InstructionSchema),
  notes: z.array(z.string()),
  prepTime: z.number(),
  cookTime: z.number(),
  totalTime: z.number(),
  servings: z.number(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()),
  emoji: z.string(),
  nutrition: NutritionSchema.nullish(),
});

export type GeneratedRecipeOutput = z.infer<typeof GeneratedRecipeSchema>;

const CreatedBySchema = z.object({
  uid: z.string(),
  displayName: z.string().nullable().catch(null),
});

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number(),
  // Nested recipes are not validated: they are chat display history, never read
  // by the tree or search queries.
  recipe: z.unknown().optional(),
});

/**
 * A recipe arriving from a user-supplied export file.
 *
 * Strict about the content fields that queries dereference — `searchRecipes`
 * spreads `tags` and maps `ingredients[].name`, so a malformed record used to
 * throw there long after the import "succeeded".
 *
 * Tolerant about the storage envelope, because fields added by Dexie migrations
 * (`createdBy` in v2, `collaborators` in v3) are absent from older exports, and
 * rejecting those files outright would be its own bug.
 */
export const ImportedRecipeSchema = GeneratedRecipeSchema.extend({
  id: z.string().min(1),
  parentId: z.string().nullable().default(null),
  rootId: z.string().min(1).optional(),
  depth: z.number().int().min(0).default(0),
  createdBy: CreatedBySchema.default({ uid: 'local', displayName: null }),
  collaborators: z.array(CreatedBySchema).default([]),
  prompt: z.string().default(''),
  chatHistory: z.array(ChatMessageSchema).default([]),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});
