import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimitedError } from '../lib/errors';
import { SUGGESTION_CAP, REPLY_CAP, WINDOW_MS, RESET_MARGIN_MS } from '../lib/rateLimit';
import type { Suggestion } from '../types/social';

/**
 * RL-048: createSuggestion and addSuggestionMessage write the content and the
 * writeWindows document in one transaction. Mocked at the SDK boundary like the
 * other firestore.*.test.ts files; the rules side is emulator-checked (ticket Notes).
 */

type Op = { op: 'set' | 'update'; path: string; data: Record<string, unknown> };
let windowDoc: { windowStart: { toMillis: () => number }; count: number } | null = null;
let ops: Op[] = [];
let commitImpl: () => Promise<void> = async () => {};
const addDoc = vi.fn(async (..._args: unknown[]) => {});
const reportError = vi.fn();
const getPaths: string[] = [];

vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

let autoId = 0;
vi.mock('firebase/firestore', () => ({
  // doc(collectionRef) mints an id, like the SDK. Notification ids (RL-049) do
  // not advance autoId, so 'auto' + autoId still names the suggestion or message.
  doc: (first: { path?: string }, ...segments: string[]) =>
    segments.length
      ? { path: segments.join('/') }
      : { path: first.path === 'notifications' ? 'notifications/n' : `${first.path}/auto${++autoId}` },
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  addDoc: (...args: unknown[]) => addDoc(...args),
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    const staged: Op[] = [];
    // RL-049: a notification transaction goes to the addDoc spy when it stages
    // the notification, and is kept out of getPaths and ops, so the RL-048
    // assertions below still see only the content transaction.
    let notification: Promise<void> | undefined;
    await fn({
      get: async (ref: { path: string }) => {
        if (!ref.path.endsWith('_notification')) getPaths.push(ref.path);
        return { exists: () => windowDoc !== null, data: () => windowDoc };
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        if (ref.path.startsWith('notifications/')) notification = addDoc(ref, data);
        else staged.push({ op: 'set', path: ref.path, data });
      },
      update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
    });
    if (notification) return notification;
    await commitImpl();
    ops = staged;
  },
}));

const { createSuggestion, addSuggestionMessage } = await import('./firestore');

const NOW = 1_800_000_000_000;
const ts = (ms: number) => ({ toMillis: () => ms });
const suggestionParams = {
  recipeId: 'recipe-1',
  recipeOwnerId: 'owner',
  recipeTitle: 'Soup',
  recipeEmoji: '🍲',
  suggestedBy: { uid: 'sam', displayName: 'Sam' },
  message: 'More salt',
};
const suggestion = {
  id: 's1',
  recipeId: 'recipe-1',
  recipeOwnerId: 'owner',
  recipeTitle: 'Soup',
  recipeEmoji: '🍲',
  suggestedBy: { uid: 'sam', displayName: 'Sam' },
  message: 'More salt',
  status: 'pending',
  createdAt: 1,
} as Suggestion;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  windowDoc = null;
  ops = [];
  getPaths.length = 0;
  commitImpl = async () => {};
  addDoc.mockReset();
  addDoc.mockImplementation(async () => {});
  reportError.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('createSuggestion (RL-048)', () => {
  it('reads the window, then writes the suggestion and a new window together', async () => {
    await createSuggestion(suggestionParams);

    expect(getPaths).toEqual(['writeWindows/sam_suggestion']);
    expect(ops).toEqual([
      {
        op: 'set',
        path: 'suggestions/auto' + autoId,
        data: expect.objectContaining({ recipeId: 'recipe-1', recipeOwnerId: 'owner', status: 'pending', message: 'More salt' }),
      },
      {
        op: 'set',
        path: 'writeWindows/sam_suggestion',
        data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: 'suggestions/auto' + autoId },
      },
    ]);
  });

  it('increments within the window without writing windowStart', async () => {
    windowDoc = { windowStart: ts(NOW - 1000), count: 4 };
    await createSuggestion(suggestionParams);
    expect(ops[1]).toEqual({
      op: 'update',
      path: 'writeWindows/sam_suggestion',
      data: { count: 5, at: 'SERVER_TS', last: ops[0].path },
    });
  });

  it('starts a new window once the old one and the margin have passed', async () => {
    windowDoc = { windowStart: ts(NOW - WINDOW_MS - RESET_MARGIN_MS - 1), count: SUGGESTION_CAP };
    await createSuggestion(suggestionParams);
    expect(ops[1]).toEqual({
      op: 'set',
      path: 'writeWindows/sam_suggestion',
      data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: ops[0].path },
    });
  });

  it('at the cap throws RateLimitedError, writes nothing, notifies nobody and reports once', async () => {
    windowDoc = { windowStart: ts(NOW - 1000), count: SUGGESTION_CAP };
    const err = await createSuggestion(suggestionParams).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).action).toBe('suggestion');
    expect(ops).toEqual([]);
    expect(addDoc).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(err, 'rate-limited-suggestion');
  });

  it('notifies the owner after the commit, and a failed notification does not fail the call', async () => {
    let committedFirst = false;
    addDoc.mockImplementationOnce(async () => {
      committedFirst = ops.length === 2;
      throw new Error('permission-denied');
    });
    await expect(createSuggestion(suggestionParams)).resolves.toBeUndefined();
    expect(committedFirst).toBe(true);
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1]).toMatchObject({ type: 'suggestion', recipientUid: 'owner', fromUid: 'sam' });
  });

  it('an offline failure rejects with the SDK error, not a RateLimitedError, and is not reported as one', async () => {
    commitImpl = async () => {
      throw Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
    };
    const err = await createSuggestion(suggestionParams).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RateLimitedError);
    expect((err as { code: string }).code).toBe('unavailable');
    expect(reportError).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('a transaction that never settles rejects after 5 s', async () => {
    commitImpl = () => new Promise(() => {});
    const done = expect(createSuggestion(suggestionParams)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(addDoc).not.toHaveBeenCalled();
  });
});

describe('createSuggestion edits (RL-147)', () => {
  const edits = [
    { kind: 'ingredient' as const, index: 0, name: 'salt', from: '1 tsp', to: '2 tsp' },
    { kind: 'general' as const, from: '', to: 'Hotter' },
  ];

  it('writes edits with the message and notifies with describeEdits', async () => {
    await createSuggestion({ ...suggestionParams, edits });
    expect(ops[0].data).toMatchObject({ message: 'More salt', edits });
    expect(addDoc.mock.calls[0][1]).toMatchObject({ message: '1 tsp salt → 2 tsp and 1 more' });
  });

  it('writes no edits key and notifies with the message when there are none', async () => {
    await createSuggestion(suggestionParams);
    expect(ops[0].data).not.toHaveProperty('edits');
    expect(addDoc.mock.calls[0][1]).toMatchObject({ message: 'More salt' });
  });
});

describe('one window bump names one document (RL-048 fix round)', () => {
  it('each call writes exactly one content document and points last at it', async () => {
    await createSuggestion(suggestionParams);
    const first = ops;
    windowDoc = { windowStart: ts(NOW - 1000), count: 1 };
    await createSuggestion(suggestionParams);
    expect(first).toHaveLength(2);
    expect(ops).toHaveLength(2);
    expect(ops[1].data.last).toBe(ops[0].path);
    expect(ops[0].path).not.toBe(first[0].path);
  });
});

describe('addSuggestionMessage (RL-048)', () => {
  it('writes the message and the reply window together, then notifies the other party', async () => {
    await addSuggestionMessage(suggestion, { uid: 'sam', displayName: 'Sam' }, 'Why?');

    expect(getPaths).toEqual(['writeWindows/sam_reply']);
    expect(ops).toEqual([
      { op: 'set', path: 'suggestions/s1/messages/auto' + autoId, data: expect.objectContaining({ fromUid: 'sam', text: 'Why?' }) },
      {
        op: 'set',
        path: 'writeWindows/sam_reply',
        data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: 'suggestions/s1/messages/auto' + autoId },
      },
    ]);
    expect(addDoc.mock.calls[0][1]).toMatchObject({ type: 'suggestion_reply', recipientUid: 'owner' });
  });

  it('at the reply cap throws RateLimitedError and reports rate-limited-reply', async () => {
    windowDoc = { windowStart: ts(NOW - 1000), count: REPLY_CAP };
    const err = await addSuggestionMessage(suggestion, { uid: 'sam', displayName: 'Sam' }, 'Why?').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).action).toBe('reply');
    expect(ops).toEqual([]);
    expect(addDoc).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(err, 'rate-limited-reply');
  });

  it('the 30th reply is allowed', async () => {
    windowDoc = { windowStart: ts(NOW - 1000), count: REPLY_CAP - 1 };
    await addSuggestionMessage(suggestion, { uid: 'owner', displayName: 'Olive' }, 'Because');
    expect(ops[1]).toEqual({
      op: 'update',
      path: 'writeWindows/owner_reply',
      data: { count: REPLY_CAP, at: 'SERVER_TS', last: ops[0].path },
    });
    expect(addDoc.mock.calls[0][1]).toMatchObject({ recipientUid: 'sam' });
  });
});
