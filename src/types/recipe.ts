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

/** Per-serving macro estimates. Absent on recipes generated before this existed. */
export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface CreatedBy {
  uid: string;
  displayName: string | null;
}

export interface Favorite {
  uid: string;
  recipeId: string;
  createdAt: number;
}

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
  /**
   * Whether this account may contribute (publish, suggest, reply).
   *
   * Not the same question as `!isAnonymous`, and the difference is the whole
   * point: `firestore.rules` gates on the `email_verified` token claim, so this
   * is the client's copy of the server's answer. Reading `isAnonymous` here
   * instead would let the UI and the rules disagree.
   */
  emailVerified: boolean;
}

export interface Collaborator {
  uid: string;
  displayName: string | null;
}

export interface Recipe {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  createdBy: CreatedBy;
  collaborators: Collaborator[];
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
  /** Optional: recipes predate this field, so absence is normal. */
  nutrition?: Nutrition | null;
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
