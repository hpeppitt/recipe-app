/**
 * List caps enforced by firestore.rules for kitchens and collections (RL-211).
 * The rules hold the same numbers in kitchenItemCap() and collectionRecipeCap();
 * kitchen.test.ts fails the build when they differ.
 */

/** Most items in a kitchen's `shopping` list, and separately in its `pantry`. */
export const KITCHEN_ITEM_CAP = 300;
/** Most recipe ids in one collection's `recipeIds`. */
export const COLLECTION_RECIPE_CAP = 200;

/** Household sharing limits enforced by firestore.rules (RL-237); kitchen.test.ts ties them to the rules. */
export const KITCHEN_MEMBER_CAP = 6;
/** An invite's `expiresAt` is at most this many days after it is created. */
export const KITCHEN_INVITE_DAYS = 7;
/** Shortest invite code, which is the `kitchenInvites` document id. */
export const KITCHEN_INVITE_CODE_MIN = 20;

/** Per-item limits the helpers apply, since the rules cap list lengths only (RL-211 review). */
export const ITEM_NAME_MAX = 80;
/** Most recipes recorded on one shopping line; a ninth starts a new line with the same key. */
export const ITEM_SOURCES_MAX = 8;
export const SOURCE_TITLE_MAX = 80;

/** One recipe's contribution to a shopping line; `amount` lets removal subtract it. */
export interface ItemSource {
  recipeId: string;
  emoji: string;
  title: string;
  amount: number | null;
}

/** Shopping line. `amount` is always the sum of its sources' amounts. */
export interface Item {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  aisle: string;
  sources: ItemSource[];
  done: boolean;
}

export interface PantryItem {
  id: string;
  name: string;
  group: 'fresh' | 'cupboard';
  addedBy: string;
  addedAt: number;
}

/** Firestore refuses documents over 1 MiB; refuse earlier with our own message (RL-211 review). */
export const KITCHEN_DOC_MAX_BYTES = 900_000;

export interface KitchenLists {
  shopping: Item[];
  pantry: PantryItem[];
}

/** Thrown before a write that would pass a list cap or the size guard. */
export class KitchenFullError extends Error {
  constructor() {
    super('Kitchen is full');
    this.name = 'KitchenFullError';
  }
}

const bytes = (lists: KitchenLists) => new TextEncoder().encode(JSON.stringify(lists)).length;

/**
 * Whether the lists fit the rules' item caps and the size guard. JSON length approximates
 * Firestore's size. A change that does not grow the lists from `before` always fits, so a
 * removal is never refused.
 */
export function kitchenFits(next: KitchenLists, before?: KitchenLists): boolean {
  const size = bytes(next);
  if (before && size <= bytes(before)) return true;
  return next.shopping.length <= KITCHEN_ITEM_CAP && next.pantry.length <= KITCHEN_ITEM_CAP && size <= KITCHEN_DOC_MAX_BYTES;
}

/** Most characters in a collection name, as the rules allow. */
export const COLLECTION_NAME_MAX = 60;
/** Longest recipe id a collection accepts; recipe ids are 36-character UUIDs (RL-211 review). */
export const COLLECTION_RECIPE_ID_MAX = 36;

/** A collection write refused before it reached Firestore; `message` is the user copy. */
export class CollectionRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionRefusedError';
  }
}

/**
 * The trimmed name, or throws CollectionRefusedError with the copy to show. UTF-16 length is at
 * least the character count the rules measure, so a name that passes here passes there.
 */
export function collectionName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new CollectionRefusedError('Give it a name.');
  if (trimmed.length > COLLECTION_NAME_MAX) throw new CollectionRefusedError('Keep it under 60 characters.');
  return trimmed;
}

/** Throws unless `id` is a non-empty string of at most 36 characters. */
export function checkCollectionRecipeId(id: string): void {
  if (typeof id !== 'string' || !id || id.length > COLLECTION_RECIPE_ID_MAX) {
    throw new CollectionRefusedError("That recipe can't be added to a collection.");
  }
}

/** Throws "This collection is full." unless one more id fits under the cap. */
export function checkCollectionRoom(recipeIds: readonly string[]): void {
  if (recipeIds.length >= COLLECTION_RECIPE_CAP) throw new CollectionRefusedError('This collection is full.');
}

/** Most collections one user may create; client-side only, the rules do not bound it (RL-222 review). */
export const COLLECTIONS_PER_USER_MAX = 100;

/** Throws unless the user has room for one more collection. */
export function checkCollectionCount(count: number): void {
  if (count >= COLLECTIONS_PER_USER_MAX) throw new CollectionRefusedError('You have 100 collections. Delete one first.');
}

export const COLLECTION_GONE_MESSAGE = 'That collection no longer exists.';

export const collectionCount = (n: number) => `${n} ${n === 1 ? 'recipe' : 'recipes'}`;
