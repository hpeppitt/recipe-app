/**
 * List caps enforced by firestore.rules for kitchens and collections (RL-211).
 * The rules hold the same numbers in kitchenItemCap() and collectionRecipeCap();
 * kitchen.test.ts fails the build when they differ.
 */

/** Most items in a kitchen's `shopping` list, and separately in its `pantry`. */
export const KITCHEN_ITEM_CAP = 300;
/** Most recipe ids in one collection's `recipeIds`. */
export const COLLECTION_RECIPE_CAP = 200;

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
