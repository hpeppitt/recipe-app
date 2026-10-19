export const APP_NAME = 'Recipe Lab';

/**
 * Where a user goes when only a human can help (the legal pages' contact address).
 * Change this before inviting anyone whose mail should not reach this address.
 */
export const SUPPORT_EMAIL = 'harry@seidrlab.com';

export const STORAGE_KEYS = {
  UNIT_SYSTEM: 'recipe-lab-unit-system',
  THEME: 'recipe-app-theme',
  DEVICE_ID: 'recipe-app-device-id',
  ANONYMOUS_UID: 'recipe-app-anonymous-uid',
  PREVIOUS_UIDS: 'recipe-app-previous-uids',
  EMAIL_FOR_LINKING: 'recipe-app-email-for-linking',
  INTRO_STATE: 'recipe-app-intro-state',
  TERMS_ACCEPTANCE: 'recipe-app-terms-acceptance',
  ANALYTICS_CONSENT: 'recipe-app-analytics-consent',
  GA_COOKIES_CLEARED: 'recipe-app-ga-cookies-cleared',
} as const;

export const SUGGESTION_CHIPS = [
  'Banana bread',
  'Quick pasta dinner',
  'Chocolate chip cookies',
  'Healthy smoothie bowl',
  'Chicken stir fry',
  'Homemade pizza dough',
] as const;

/** Fixed refinements offered once a recipe exists; each is sent as if typed. */
export const REFINEMENT_CHIPS = ['Make it spicier', 'Fewer dishes', 'No dairy'] as const;

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/**
 * Curated Explore tag chips (RL-009). Lower case and exact: Firestore
 * `array-contains` matches the stored string byte for byte. `publishRecipe`
 * lower-cases published tags (RL-059), so the chips match regardless of the
 * case the AI wrote. The word itself must still match exactly.
 */
/** Fields of the Explore tag query; firestore.indexes.json must match (indexes.test.ts). */
export const EXPLORE_TAG_FIELD = 'tags';
export const FEED_ORDER_FIELD = 'createdAt';

export const EXPLORE_TAGS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dessert',
  'breakfast',
  'dinner',
  'quick',
  'italian',
  'asian',
  'baking',
] as const;
