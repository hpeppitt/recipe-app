import type { Ingredient, Recipe } from '../types/recipe';
import type { Cook } from '../types/social';

let counter = 0;

export function makeIngredient(name: string): Ingredient {
  return { amount: 1, unit: null, name, notes: null, group: null };
}

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  counter += 1;
  const id = overrides.id ?? `recipe-${counter}`;
  return {
    id,
    parentId: null,
    rootId: id,
    depth: 0,
    createdBy: { uid: 'local', displayName: null },
    collaborators: [],
    title: 'Untitled',
    description: '',
    ingredients: [],
    instructions: [],
    notes: [],
    prepTime: 10,
    cookTime: 20,
    totalTime: 30,
    servings: 2,
    difficulty: 'easy',
    tags: [],
    emoji: '🍳',
    prompt: '',
    chatHistory: [],
    createdAt: 1_000_000 + counter,
    updatedAt: 1_000_000 + counter,
    ...overrides,
  };
}

let cookCounter = 0;

export function makeCook(overrides: Partial<Cook> = {}): Cook {
  cookCounter += 1;
  return {
    id: `cook-${cookCounter}`,
    uid: `user-${cookCounter}`,
    displayName: null,
    recipeId: 'recipe-1',
    rootId: 'recipe-1',
    recipeOwnerId: 'owner',
    vote: 'again',
    note: null,
    branchId: null,
    createdAt: 1_000_000 + cookCounter,
    ...overrides,
  };
}
