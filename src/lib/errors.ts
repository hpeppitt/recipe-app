export interface FriendlyError {
  message: string;
  /** Which affordance to offer alongside the message. */
  action?: 'settings';
}

export const MISSING_API_KEY: FriendlyError = {
  message: 'Add your Gemini API key in Settings to start generating recipes.',
  action: 'settings',
};

/**
 * Turn an unknown throw from the Gemini SDK into something worth showing a user.
 *
 * Raw SDK messages were previously rendered verbatim. They are written for
 * developers, can run to hundreds of characters of JSON, and can echo back
 * request details including the key-bearing URL — so the raw text is never
 * surfaced here. Callers should `console.error` the original for debugging.
 */
export function describeGenerationError(err: unknown): FriendlyError {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();

  // Gemini reports a bad key as 400 API_KEY_INVALID, and a disabled one as 403.
  if (
    raw.includes('api key not valid') ||
    raw.includes('api_key_invalid') ||
    raw.includes('api key expired') ||
    raw.includes('permission_denied') ||
    raw.includes('401') ||
    raw.includes('403')
  ) {
    return {
      message: 'Gemini rejected your API key. Check or replace it in Settings.',
      action: 'settings',
    };
  }

  if (raw.includes('429') || raw.includes('quota') || raw.includes('rate limit')) {
    return {
      message: 'Gemini is rate-limiting requests right now. Wait a moment and try again.',
    };
  }

  if (
    raw.includes('failed to fetch') ||
    raw.includes('networkerror') ||
    raw.includes('network error') ||
    raw.includes('load failed') ||
    raw.includes('timeout')
  ) {
    return { message: "Couldn't reach Gemini. Check your connection and try again." };
  }

  // Zod validation or JSON.parse failure on the model's output.
  if (
    raw.includes('json') ||
    raw.includes('unexpected token') ||
    raw.includes('invalid_type') ||
    raw.includes('expected')
  ) {
    return {
      message: 'Gemini returned a recipe we could not read. Try rephrasing your request.',
    };
  }

  if (raw.includes('500') || raw.includes('503') || raw.includes('unavailable')) {
    return { message: 'Gemini is temporarily unavailable. Try again in a moment.' };
  }

  return { message: 'Something went wrong generating the recipe. Please try again.' };
}
