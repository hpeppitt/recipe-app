export const APP_NAME = 'Recipe Lab';

export const STORAGE_KEYS = {
  API_KEY: 'recipe-app-gemini-api-key',
  THEME: 'recipe-app-theme',
  DEVICE_ID: 'recipe-app-device-id',
  ANONYMOUS_UID: 'recipe-app-anonymous-uid',
  PREVIOUS_UIDS: 'recipe-app-previous-uids',
  EMAIL_FOR_LINKING: 'recipe-app-email-for-linking',
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
