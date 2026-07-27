export interface FriendlyError {
  message: string;
  /** Which affordance to offer alongside the message. */
  action?: 'settings';
}

/**
 * Generation runs through Firebase AI Logic, so it needs a configured Firebase
 * project. There is no user-supplied key any more, and therefore nothing the user
 * can do in Settings about it — hence no `action`.
 */
export const GENERATION_UNAVAILABLE: FriendlyError = {
  message:
    'Recipe generation is unavailable because this build has no Firebase configuration.',
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
  // App Check rejection is the most likely 401/403 now: the proxy refuses a request
  // without valid app attestation.
  if (raw.includes('app check') || raw.includes('appcheck')) {
    return {
      message:
        "This app couldn't verify itself with the recipe service. Reload the page and try again.",
    };
  }

  // A rejected key is no longer the user's problem — Firebase provisions and holds
  // it — so this must NOT point at Settings, which no longer has a key field.
  if (
    raw.includes('api key not valid') ||
    raw.includes('api_key_invalid') ||
    raw.includes('api key expired') ||
    raw.includes('permission_denied') ||
    raw.includes('401') ||
    raw.includes('403')
  ) {
    return {
      message: 'Recipe generation is misconfigured and was rejected. Please report this.',
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
