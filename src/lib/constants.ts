export const APP_NAME = 'Recipe Lab';

/**
 * Where a user goes when only a human can help — currently just the stranded-uid
 * notice, which is a permanent answer rather than a placeholder because the real
 * server-side fix needs the Blaze plan. Change this before inviting anyone whose
 * mail should not reach this address.
 */
export const SUPPORT_EMAIL = 'harry@seidrlab.com';

export const STORAGE_KEYS = {
  UNIT_SYSTEM: 'recipe-lab-unit-system',
  THEME: 'recipe-app-theme',
  DEVICE_ID: 'recipe-app-device-id',
  ANONYMOUS_UID: 'recipe-app-anonymous-uid',
  PREVIOUS_UIDS: 'recipe-app-previous-uids',
  EMAIL_FOR_LINKING: 'recipe-app-email-for-linking',
  STRANDED_IDENTITY: 'recipe-app-stranded-identity',
  INTRO_STATE: 'recipe-app-intro-state',
  LIBRARY_TAB: 'recipe-app-library-tab',
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

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/**
 * Curated Explore tag chips (RL-009). Lower case and exact: Firestore
 * `array-contains` matches the stored string byte for byte, and the AI writes
 * tags as free text, so a recipe tagged "Italian" does not match "italian".
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
