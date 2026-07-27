import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { RECIPE_SYSTEM_PROMPT, getVariationSystemPrompt } from './prompts';

initializeApp();

/**
 * The Gemini key, held as a Functions secret so it never reaches the browser.
 * Set it with: firebase functions:secrets:set GEMINI_API_KEY
 */
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const MODEL = 'gemini-2.0-flash';

// Abuse limits. Every caller is authenticated, so these are per-account rather
// than per-IP, which is far harder to work around than bot heuristics.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 30;

// Input caps: a generous conversation, but bounded so nobody can push arbitrary
// volumes of text through our quota.
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_PARENT_JSON_CHARS = 20000;

interface HistoryEntry {
  role: 'user' | 'model';
  text: string;
}

interface GenerateRequest {
  mode?: 'create' | 'vary';
  history?: HistoryEntry[];
  parent?: Record<string, unknown>;
}

function assertValidHistory(history: unknown): HistoryEntry[] {
  if (!Array.isArray(history) || history.length === 0) {
    throw new HttpsError('invalid-argument', 'history must be a non-empty array.');
  }
  if (history.length > MAX_HISTORY_MESSAGES) {
    throw new HttpsError('invalid-argument', 'Conversation is too long.');
  }
  return history.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      ((entry as HistoryEntry).role !== 'user' && (entry as HistoryEntry).role !== 'model') ||
      typeof (entry as HistoryEntry).text !== 'string'
    ) {
      throw new HttpsError('invalid-argument', 'Malformed history entry.');
    }
    const { role, text } = entry as HistoryEntry;
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new HttpsError('invalid-argument', 'Message is too long.');
    }
    return { role, text };
  });
}

/**
 * Fixed-window counter per uid, in a transaction so parallel calls can't both
 * read the same count and slip past the limit.
 *
 * Lives in Firestore because Functions instances are ephemeral and horizontally
 * scaled — in-memory counters would reset constantly and disagree between
 * instances. The `rateLimits` collection is denied to clients in firestore.rules;
 * the Admin SDK used here bypasses rules.
 */
async function enforceRateLimit(uid: string): Promise<void> {
  const ref = getFirestore().collection('rateLimits').doc(uid);
  const now = Date.now();

  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const windowStart = typeof data?.windowStartMs === 'number' ? data.windowStartMs : 0;
    const count = typeof data?.count === 'number' ? data.count : 0;

    if (now - windowStart >= RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStartMs: now, count: 1, updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    if (count >= RATE_LIMIT_MAX_CALLS) {
      throw new HttpsError(
        'resource-exhausted',
        "You've hit the hourly limit for generating recipes. Try again a bit later."
      );
    }

    tx.set(
      ref,
      { windowStartMs: windowStart, count: count + 1, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
}

export const generateRecipe = onCall(
  { secrets: [GEMINI_API_KEY], region: 'us-central1', maxInstances: 10 },
  async (request) => {
    // Any signed-in user, anonymous included — the app's create flow signs people
    // in with one tap, so this keeps the flow frictionless while still giving
    // every call an identity to rate-limit.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to generate recipes.');
    }

    const { mode, history, parent } = (request.data ?? {}) as GenerateRequest;
    const safeHistory = assertValidHistory(history);

    let systemInstruction: string;
    if (mode === 'vary') {
      if (!parent || typeof parent !== 'object') {
        throw new HttpsError('invalid-argument', 'A variation needs its parent recipe.');
      }
      const parentJson = JSON.stringify(parent);
      if (parentJson.length > MAX_PARENT_JSON_CHARS) {
        throw new HttpsError('invalid-argument', 'Parent recipe is too large.');
      }
      systemInstruction = getVariationSystemPrompt(parentJson);
    } else {
      systemInstruction = RECIPE_SYSTEM_PROMPT;
    }

    await enforceRateLimit(request.auth.uid);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

    let text: string;
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        config: { systemInstruction, responseMimeType: 'application/json' },
        contents: safeHistory.map((entry) => ({
          role: entry.role,
          parts: [{ text: entry.text }],
        })),
      });
      text = response.text ?? '';
    } catch (err) {
      // Never forward the SDK's message: it embeds the request URL, which carries
      // the API key. Log it server-side and hand the client something safe.
      console.error('Gemini generation failed', err);
      throw new HttpsError('internal', 'Gemini could not generate a recipe right now.');
    }

    if (!text.trim()) {
      throw new HttpsError('internal', 'Gemini returned an empty response.');
    }

    // Returned raw; the client already parses and Zod-validates this exact shape.
    return { text };
  }
);
