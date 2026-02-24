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
});

export type GeneratedRecipeOutput = z.infer<typeof GeneratedRecipeSchema>;
