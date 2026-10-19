/**
 * Photos sent with a chat message as generation input (RL-118).
 *
 * They are held in memory for the length of the chat and sent to Gemini only:
 * never stored, never in `chatHistory` or `prompt` (decision 3, no photo storage).
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGES_PER_MESSAGE = 3;
// The AI Logic ChatSession resends the whole history, photos included, every turn.
export const MAX_IMAGES_PER_CHAT = 6;
/** Rejected before decoding, so a huge file never reaches a canvas. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/**
 * Rejected after decoding but before drawing: a small file can still decode to a
 * huge bitmap. shortcut: this guard runs after a full decode, so the decode itself is
 * not bounded; accepted for now, to be checked with a real 48 MP photo on a device.
 */
export const MAX_SOURCE_PIXELS = 60_000_000;
export const MAX_LONG_SIDE_PX = 1024;
/** First attempt, then one retry if the result is over `MAX_ENCODED_BYTES`. */
export const JPEG_QUALITIES = [0.8, 0.6] as const;
/** Per image after downscale, in decoded bytes (not base64 length). */
export const MAX_ENCODED_BYTES = 600 * 1024;
/** Sent and stored as the user's text when they send photos with no text. */
export const IMAGE_ONLY_PROMPT = 'Suggest a recipe based on these photos.';

/** A downscaled photo. `base64` has no `data:` prefix. */
export type ImageAttachment = { mimeType: 'image/jpeg'; base64: string };

export type AttachmentRejection = 'type' | 'too-large' | 'message-limit' | 'chat-limit';

export function validateImageFile(
  file: { type: string; size: number },
  counts: { inMessage: number; inChat: number }
): { ok: true } | { ok: false; reason: AttachmentRejection } {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return { ok: false, reason: 'type' };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, reason: 'too-large' };
  if (counts.inMessage >= MAX_IMAGES_PER_MESSAGE) return { ok: false, reason: 'message-limit' };
  if (counts.inChat >= MAX_IMAGES_PER_CHAT) return { ok: false, reason: 'chat-limit' };
  return { ok: true };
}

/** Integer size with the longest side at most `maxSide`, aspect kept, never upscaled. */
export function planDownscale(
  width: number,
  height: number,
  maxSide = MAX_LONG_SIDE_PX
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}

const MESSAGES: Record<AttachmentRejection | 'encode', string> = {
  type: 'Use a JPEG, PNG or WebP photo.',
  'too-large': 'That photo is too large. Try a smaller one.',
  'message-limit': `You can add up to ${MAX_IMAGES_PER_MESSAGE} photos at a time.`,
  'chat-limit': `This chat already has ${MAX_IMAGES_PER_CHAT} photos. Start a new recipe to use more.`,
  encode: "That photo couldn't be read. Try another one.",
};

/** `'encode'` covers a downscale that failed or stayed over the cap. */
export function attachmentErrorMessage(reason: AttachmentRejection | 'encode'): string {
  return MESSAGES[reason];
}

const BASE64_RUN = /[A-Za-z0-9+/=]{200,}/g;
const scrub = (s: string) => s.replace(BASE64_RUN, '[redacted]');

/**
 * Strips long base64-like runs (inline photo data an SDK error might echo) from an
 * error before it is logged, reported or classified. An error with none is
 * returned as is; otherwise a copy, so the original is not mutated.
 */
export function redactInlineData(err: unknown): unknown {
  if (typeof err === 'string') return scrub(err);
  if (!(err instanceof Error)) return err;
  const message = scrub(err.message);
  const stack = err.stack === undefined ? undefined : scrub(err.stack);
  if (message === err.message && stack === err.stack) return err;
  const copy = new Error(message);
  copy.name = err.name;
  copy.stack = stack;
  return copy;
}
