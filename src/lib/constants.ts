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
