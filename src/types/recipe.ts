export interface Ingredient {
  amount: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  group: string | null;
}

export interface Instruction {
  step: number;
  text: string;
  group: string | null;
}

export interface Recipe {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  notes: string[];
  prepTime: number;
  cookTime: number;
  totalTime: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  emoji: string;
  prompt: string;
  chatHistory: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  recipe?: Recipe;
  timestamp: number;
}

export type RecipeWithChildren = Recipe & {
  childCount: number;
};
