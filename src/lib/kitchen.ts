/**
 * List caps enforced by firestore.rules for kitchens and collections (RL-211).
 * The rules hold the same numbers in kitchenItemCap() and collectionRecipeCap();
 * kitchen.test.ts fails the build when they differ.
 */

/** Most items in a kitchen's `shopping` list, and separately in its `pantry`. */
export const KITCHEN_ITEM_CAP = 300;
/** Most recipe ids in one collection's `recipeIds`. */
export const COLLECTION_RECIPE_CAP = 200;
