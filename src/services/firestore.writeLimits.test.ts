import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeRecipe } from '../test/factories';
import { RateLimitedError } from '../lib/errors';
import { NOTIFICATION_CAP, RECIPE_CAP, WINDOW_MS } from '../lib/rateLimit';

/**
 * RL-049: every notification and every recipe create goes through the
 * writeWindows transaction. Mocked at the SDK boundary like
 * firestore.rateLimit.test.ts; the rules side is emulator-checked (ticket Notes).
 */

type Op = { op: 'set' | 'update'; path: string; data: Record<string, unknown>; opts?: unknown };
const getPaths: string[] = [];
type Win = { windowStart: { toMillis: () => number }; count: number };
const windows: Record<string, Win | undefined> = {};
const commits: Op[][] = [];
let txImpl: () => Promise<void> = async () => {};
let recipeExists = false;
// What the transaction's own read of the recipe sees (it can differ from getDoc's).
let txRecipeExists = false;
const authState: { currentUser: { uid: string } | null } = { currentUser: { uid: 'u1' } };
const setDoc = vi.fn(async (..._a: unknown[]) => {});
const updateDoc = vi.fn(async (..._a: unknown[]) => {});
const batchCommit = vi.fn(async () => {});
const reportError = vi.fn();

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: authState, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

let autoId = 0;
vi.mock('firebase/firestore', () => ({
  doc: (first: { path?: string }, ...segments: string[]) =>
    segments.length ? { path: segments.join('/') } : { path: `${first.path}/auto${++autoId}` },
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: async () => ({ exists: () => recipeExists }),
  setDoc: (...a: unknown[]) => setDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => 'SERVER_TS',
  writeBatch: () => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: batchCommit }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const staged: Op[] = [];
    const result = await fn({
      get: async (ref: { path: string }) => {
        getPaths.push(ref.path);
        if (ref.path.startsWith('recipes/')) return { exists: () => txRecipeExists, data: () => ({}) };
        const w = windows[ref.path];
        return { exists: () => w !== undefined, data: () => w };
      },
      set: (ref: { path: string }, data: Record<string, unknown>, opts?: unknown) =>
        staged.push({ op: 'set', path: ref.path, data, ...(opts ? { opts } : {}) }),
      update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
    });
    await txImpl();
    commits.push(staged);
    return result;
  },
}));

const { addCloudFavorite, followUser, publishRecipe } = await import('./firestore');

const NOW = 1_800_000_000_000;
const ts = (ms: number) => ({ toMillis: () => ms });
// Lets the fire-and-forget notification transaction finish.
const settle = () => vi.advanceTimersByTimeAsync(0);
const favourite = () => addCloudFavorite('fan', 'r1', 'owner', 'Soup', '🍲', 'Fan');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  for (const k of Object.keys(windows)) delete windows[k];
  commits.length = 0;
  txImpl = async () => {};
  recipeExists = false;
  txRecipeExists = false;
  authState.currentUser = { uid: 'u1' };
  getPaths.length = 0;
  setDoc.mockClear();
  updateDoc.mockClear();
  batchCommit.mockClear();
  batchCommit.mockImplementation(async () => {});
  reportError.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('notifications (RL-049)', () => {
  it('a favourite commits first, then writes one notification and bumps the notification window', async () => {
    await favourite();
    await settle();

    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(commits).toHaveLength(1);
    const [note, win] = commits[0];
    expect(note).toMatchObject({ op: 'set', data: { type: 'favorite', recipientUid: 'owner', fromUid: 'fan' } });
    expect(note.path).toMatch(/^notifications\//);
    expect(win).toEqual({
      op: 'set',
      path: 'writeWindows/fan_notification',
      data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: note.path },
    });
  });

  it('the 60th in the window is written', async () => {
    windows['writeWindows/fan_notification'] = { windowStart: ts(NOW - 1000), count: NOTIFICATION_CAP - 1 };
    await favourite();
    await settle();
    expect(commits[0][1]).toMatchObject({ op: 'update', data: { count: NOTIFICATION_CAP } });
  });

  it('at the cap the notification is skipped silently, reported once, and the favourite still lands', async () => {
    windows['writeWindows/fan_notification'] = { windowStart: ts(NOW - 1000), count: NOTIFICATION_CAP };
    await expect(favourite()).resolves.toBeUndefined();
    await settle();

    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(commits).toEqual([]);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toBeInstanceOf(RateLimitedError);
    expect(reportError.mock.calls[0][1]).toBe('rate-limited-notification');
  });

  it('a follow at the cap still follows and writes no notification', async () => {
    windows['writeWindows/me_notification'] = { windowStart: ts(NOW - 1000), count: NOTIFICATION_CAP };
    await expect(followUser('me', 'you', 'Me')).resolves.toBeUndefined();
    await settle();

    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(commits).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(expect.any(RateLimitedError), 'rate-limited-notification');
  });

  it('a failing notification transaction does not fail the caller and is not reported', async () => {
    txImpl = async () => {
      throw Object.assign(new Error('offline'), { code: 'unavailable' });
    };
    await expect(followUser('me', 'you', 'Me')).resolves.toBeUndefined();
    await settle();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('a notification transaction that never settles does not hold the caller', async () => {
    txImpl = () => new Promise(() => {});
    await expect(favourite()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('no notification and no window for favouriting your own recipe', async () => {
    await addCloudFavorite('owner', 'r1', 'owner', 'Soup', '🍲', 'Olive');
    await settle();
    expect(commits).toEqual([]);
  });
});

describe('publishRecipe create limit (RL-049)', () => {
  const recipe = () => makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' } });

  it('writes the recipe and the recipe window together, with last naming the recipe', async () => {
    await publishRecipe(recipe());

    expect(commits).toHaveLength(1);
    const [doc, win] = commits[0];
    expect(doc).toMatchObject({ op: 'set', path: 'recipes/r1', data: { favoriteCount: 0, viewCount: 0 } });
    expect(win).toEqual({
      op: 'set',
      path: 'writeWindows/u1_recipe',
      data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: 'recipes/r1' },
    });
    expect(updateDoc).toHaveBeenCalledWith({ path: 'profiles/u1' }, { recipeCount: { __increment: 1 } });
  });

  it('reads the recipe and the window in the transaction', async () => {
    await publishRecipe(recipe());
    expect(getPaths).toEqual(['recipes/r1', 'writeWindows/u1_recipe']);
  });

  // Review MED: a save-time publish that timed out but landed, then Share: getDoc
  // still says missing, but the transaction's own read sees the recipe.
  it('a recipe that appears before the transaction gets the re-publish merge: no counters, window or recipeCount', async () => {
    windows['writeWindows/u1_recipe'] = { windowStart: ts(NOW - 1000), count: RECIPE_CAP };
    txRecipeExists = true;
    const r = makeRecipe({ id: 'r1', createdBy: { uid: 'u1', displayName: 'U' }, collaborators: [{ uid: 'c', displayName: 'C' }] });
    await publishRecipe(r);

    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(1);
    const [write] = commits[0];
    expect(write).toMatchObject({ op: 'set', path: 'recipes/r1', opts: { merge: true } });
    expect(write.data).not.toHaveProperty('favoriteCount');
    expect(write.data).not.toHaveProperty('viewCount');
    expect(write.data).not.toHaveProperty('collaborators');
    expect(write.data).not.toHaveProperty('chatHistory');
    expect(write.data.title).toBe(r.title);
    expect(getPaths).toEqual(['recipes/r1']);
    expect(updateDoc).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each([
    ['the local placeholder', 'local', { uid: 'u1' }],
    ['signed out', 'u1', null],
    ['someone else', 'other', { uid: 'u1' }],
  ])('rejects without any read or write when the creator is %s', async (_label, uid, user) => {
    authState.currentUser = user;
    await expect(publishRecipe(makeRecipe({ id: 'r1', createdBy: { uid, displayName: null } }))).rejects.toThrow(
      'Publishing needs the signed-in creator'
    );
    expect(getPaths).toEqual([]);
    expect(commits).toEqual([]);
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('the 30th create in a day is written', async () => {
    windows['writeWindows/u1_recipe'] = { windowStart: ts(NOW - 1000), count: RECIPE_CAP - 1 };
    await publishRecipe(recipe());
    expect(commits[0][1]).toMatchObject({ op: 'update', data: { count: RECIPE_CAP, last: 'recipes/r1' } });
  });

  it('at the cap throws RateLimitedError(recipe), writes nothing, bumps no profile and reports once', async () => {
    windows['writeWindows/u1_recipe'] = { windowStart: ts(NOW - 1000), count: RECIPE_CAP };
    const err = await publishRecipe(recipe()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).action).toBe('recipe');
    expect(commits).toEqual([]);
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(err, 'rate-limited-recipe');
  });

  it('the window is a day: two hours later the user is still limited', async () => {
    windows['writeWindows/u1_recipe'] = { windowStart: ts(NOW - 2 * WINDOW_MS), count: RECIPE_CAP };
    await expect(publishRecipe(recipe())).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('a re-publish (update) at the cap is not limited and opens no transaction', async () => {
    recipeExists = true;
    windows['writeWindows/u1_recipe'] = { windowStart: ts(NOW - 1000), count: RECIPE_CAP };
    await publishRecipe(recipe());

    expect(commits).toEqual([]);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][2]).toEqual({ merge: true });
    expect(reportError).not.toHaveBeenCalled();
  });
});
