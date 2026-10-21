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
  /** How the account signs in (RL-189); empty for an anonymous account. */
  providers: ('google' | 'email')[];
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
  /**
   * On an original written after "Create New Recipe Anyway": the rootId of the first
   * similar match shown (RL-161, RL-162). Absent otherwise. Not indexed in Dexie.
   */
  relatedFamilyId?: string | null;
  /** The page a link import read (RL-185). Absent on every other recipe. */
  importedFrom?: string;
  /** Who imported it; RL-186 writes this and `importedFrom`. */
  importedVia?: CreatedBy;
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
