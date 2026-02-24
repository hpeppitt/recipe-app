export interface GeneratedRecipe {
  title: string;
  description: string;
  ingredients: {
    amount: number | null;
    unit: string | null;
    name: string;
    notes: string | null;
    group: string | null;
  }[];
  instructions: {
    step: number;
    text: string;
    group: string | null;
  }[];
  notes: string[];
  prepTime: number;
  cookTime: number;
  totalTime: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  emoji: string;
}
