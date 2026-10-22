import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimitedError, rateLimitMessage, RecipeNotPublishedError, TermsNotAcceptedError } from '../lib/errors';
import { COOK_CAP, RECIPE_WINDOW_MS } from '../lib/rateLimit';
import { TERMS_VERSION } from '../lib/legal';

/**
 * RL-196: the cook service, mocked at the SDK boundary like the other
 * firestore.*.test.ts files. The rules side is RL-194's and is emulator-checked.
 */

type Op = { op: 'set' | 'update'; path: string; data: Record<string, unknown> };
let windowDoc: { windowStart: { toMillis: () => number }; count: number } | null = null;
let ops: Op[] = [];
let commitImpl: () => Promise<void> = async () => {};
let termsVersion: string | null = null;
let hangCounts = false;
let hangDocs = false;
// Documents the transaction can read besides the window, by path.
let stored: Record<string, Record<string, unknown>> = {};
const queries: unknown[][] = [];
const updateDoc = vi.fn(async (..._a: unknown[]) => {});
const deleteDoc = vi.fn(async (..._a: unknown[]) => {});
const setDoc = vi.fn(async (..._a: unknown[]) => {});
let photoExists = true;
const getDoc = vi.fn(async (ref: { path: string }) =>
  ref.path.startsWith('cookPhotos/')
    ? { exists: () => photoExists }
    : { exists: () => termsVersion !== null, data: () => ({ version: termsVersion }) }
);
const authState: { currentUser: unknown } = { currentUser: null };

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: authState, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));

let autoId = 0;
vi.mock('firebase/firestore', () => ({
  doc: (first: { path?: string }, ...segments: string[]) => {
    const path = segments.length ? segments.join('/') : `${first.path}/auto${++autoId}`;
    return { path, id: path.split('/').pop() };
  },
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  serverTimestamp: () => 'SERVER_TS',
  where: (...a: unknown[]) => ['where', ...a],
  orderBy: (...a: unknown[]) => ['orderBy', ...a],
  limit: (n: number) => ['limit', n],
  query: (_c: unknown, ...constraints: unknown[]) => {
    queries.push(constraints);
    return constraints;
  },
  getCountFromServer: async (q: unknown[]) => hangCounts ? new Promise(() => {}) : ({
    data: () => ({ count: JSON.stringify(q).includes('again') ? 3 : 7 }),
  }),
  getDocs: async () => hangDocs ? new Promise(() => {}) : ({
    docs: [
      { id: 'c1', data: () => ({ uid: 'u', vote: 'again', createdAt: { toMillis: () => 5 } }) },
      // A pending write before the server stamps it.
      { id: 'c2', data: () => ({ uid: 'u', vote: 'tweak', createdAt: null }) },
    ],
  }),
  getDoc: (ref: { path: string }) => getDoc(ref),
  onSnapshot: (q: unknown, next: (s: unknown) => void) => {
    queries.push(q as unknown[]);
    next({ docs: [{ id: 'c1', data: () => ({ uid: 'u', createdAt: { toMillis: () => 9 } }) }] });
    return () => {};
  },
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const staged: Op[] = [];
    const out = await fn({
      get: async (ref: { path: string }) => {
        const data = ref.path.startsWith('writeWindows/') ? windowDoc : stored[ref.path];
        return { exists: () => data != null, data: () => data ?? undefined };
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
    });
    await commitImpl();
    ops = staged;
    for (const o of staged) if (o.op === 'set' && o.path.startsWith('cooks/')) stored[o.path] = o.data;
    return out;
  },
}));

const { logCook, newCookId, getRecipeCookSummary, countUserCooks, getOwnCooksInFamily, getRecentCooks, getFamilyCooks, subscribeOwnCooks, setCookBranch, deleteCook, addCookPhoto } = await import('./firestore');

const NOW = 1_800_000_000_000;
const params = {
  recipeId: 'r2',
  vote: 'again' as const,
  note: '  More garlic  ',
  user: { uid: 'sam', displayName: 'Sam' },
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  windowDoc = null;
  ops = [];
  queries.length = 0;
  commitImpl = async () => {};
  termsVersion = TERMS_VERSION;
  hangCounts = false;
  hangDocs = false;
  stored = { 'recipes/r2': { rootId: 'r1', createdBy: { uid: 'owner', displayName: 'Owner' } } };
  updateDoc.mockClear();
  deleteDoc.mockReset().mockResolvedValue(undefined);
  setDoc.mockReset().mockResolvedValue(undefined);
  photoExists = true;
  getDoc.mockClear();
  authState.currentUser = { uid: 'sam' };
});
afterEach(() => vi.useRealTimers());

describe('logCook', () => {
  it('writes the cook and the cook window in one transaction, with exactly the rules keys', async () => {
    const id = await logCook(params);
    expect(id).toBe(`auto${autoId}`);
    expect(ops).toEqual([
      {
        op: 'set',
        path: `cooks/${id}`,
        data: {
          uid: 'sam',
          displayName: 'Sam',
          recipeId: 'r2',
          rootId: 'r1',
          recipeOwnerId: 'owner',
          vote: 'again',
          note: 'More garlic',
          branchId: null,
          createdAt: 'SERVER_TS',
        },
      },
      { op: 'set', path: 'writeWindows/sam_cook', data: { windowStart: 'SERVER_TS', count: 1, at: 'SERVER_TS', last: `cooks/${id}` } },
    ]);
  });

  it('stores an empty note as null and bounds the name and note to the rules sizes', async () => {
    await logCook({ ...params, note: '   ', user: { uid: 'sam', displayName: 'x'.repeat(150) } });
    expect(ops[0].data.note).toBeNull();
    expect((ops[0].data.displayName as string).length).toBe(100);
    await logCook({ ...params, note: 'n'.repeat(600) });
    expect((ops[0].data.note as string).length).toBe(500);
  });

  it('takes rootId and recipeOwnerId from the stored recipe, not the caller', async () => {
    stored['recipes/r2'] = { rootId: 'real-root', createdBy: { uid: 'real-owner' } };
    await logCook(params);
    expect(ops[0].data).toEqual(expect.objectContaining({ rootId: 'real-root', recipeOwnerId: 'real-owner' }));
  });

  it.each([
    ['missing', undefined],
    ['without a rootId', { createdBy: { uid: 'owner' } }],
  ])('refuses a recipe that is %s, writing nothing', async (_label, recipe) => {
    if (recipe) stored['recipes/r2'] = recipe;
    else delete stored['recipes/r2'];
    const err = await logCook(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RecipeNotPublishedError);
    expect((err as Error).message).toBe('Publish this recipe before logging a cook.');
    expect(ops).toEqual([]);
  });

  it('a retry under the same id writes once and does not move the window again', async () => {
    const cookId = newCookId();
    expect(await logCook({ ...params, cookId })).toBe(cookId);
    expect(ops.map((o) => o.path)).toEqual([`cooks/${cookId}`, 'writeWindows/sam_cook']);
    windowDoc = { windowStart: { toMillis: () => NOW }, count: 1 };
    expect(await logCook({ ...params, cookId })).toBe(cookId);
    expect(ops).toEqual([]);
  });

  it('throws the cook rate-limit error at the cap, having written nothing', async () => {
    windowDoc = { windowStart: { toMillis: () => NOW - 1000 }, count: COOK_CAP };
    const err = await logCook(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(rateLimitMessage(err)).toBe("You've logged a lot of cooks today. Try again tomorrow.");
    expect(ops).toEqual([]);
  });

  it('starts a new window once the day has passed', async () => {
    windowDoc = { windowStart: { toMillis: () => NOW - RECIPE_WINDOW_MS - 120_000 }, count: COOK_CAP };
    await logCook(params);
    expect(ops[1].data).toEqual(expect.objectContaining({ count: 1, windowStart: 'SERVER_TS' }));
  });

  it('maps a denial from stale Terms to TermsNotAcceptedError', async () => {
    termsVersion = '2000-01-01';
    commitImpl = async () => {
      throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    };
    const err = await logCook(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TermsNotAcceptedError);
    expect((err as Error).message).toMatch(/Terms/);
  });

  it('keeps any other denial as it is', async () => {
    commitImpl = async () => {
      throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    };
    const err = await logCook(params).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(TermsNotAcceptedError);
    expect((err as { code: string }).code).toBe('permission-denied');
  });

  it('rejects after 5 s', async () => {
    commitImpl = () => new Promise(() => {});
    const p = logCook(params).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000);
    expect(((await p) as Error).message).toMatch(/timed out/);
  });
});

describe('countUserCooks', () => {
  it('counts the cooks where uid matches with one count query', async () => {
    queries.length = 0;
    expect(await countUserCooks('u1')).toBe(7);
    expect(queries).toEqual([[['where', 'uid', '==', 'u1']]]);
  });
});

describe('getRecipeCookSummary', () => {
  it('counts all and again, reads the newest 20, and needs no sign-in', async () => {
    authState.currentUser = null;
    const s = await getRecipeCookSummary('r2');
    expect(s.total).toBe(7);
    expect(s.again).toBe(3);
    expect(s.recent.map((c) => [c.id, c.createdAt])).toEqual([
      ['c1', 5],
      ['c2', 0],
    ]);
    expect(queries).toEqual([
      [['where', 'recipeId', '==', 'r2']],
      [['where', 'recipeId', '==', 'r2'], ['where', 'vote', '==', 'again']],
      [['where', 'recipeId', '==', 'r2'], ['orderBy', 'createdAt', 'desc'], ['limit', 20]],
    ]);
  });
});

describe('getRecipeCookSummary bound', () => {
  it('rejects after 6 s, not 5', async () => {
    hangCounts = true;
    let settled = false;
    const p = getRecipeCookSummary('r2').catch((e: unknown) => {
      settled = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(((await p) as Error).message).toMatch(/timed out/);
  });
});

describe('subscribeOwnCooks', () => {
  it('queries the uid newest first, capped at 200', () => {
    const seen: number[] = [];
    subscribeOwnCooks('sam', (cooks) => seen.push(...cooks.map((c) => c.createdAt)));
    expect(queries[0]).toEqual([['where', 'uid', '==', 'sam'], ['orderBy', 'createdAt', 'desc'], ['limit', 200]]);
    expect(seen).toEqual([9]);
  });
});

describe('setCookBranch and deleteCook', () => {
  it('updates only branchId', async () => {
    await setCookBranch('c1', 'b1');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'cooks/c1', id: 'c1' }, { branchId: 'b1' });
  });

  it('deletes the photo first, then the cook', async () => {
    await deleteCook('c1');
    expect(deleteDoc.mock.calls).toEqual([[{ path: 'cookPhotos/c1', id: 'c1' }], [{ path: 'cooks/c1', id: 'c1' }]]);
  });

  it('skips the photo delete when the cook has no photo', async () => {
    photoExists = false;
    await deleteCook('c1');
    expect(getDoc).toHaveBeenCalledWith({ path: 'cookPhotos/c1', id: 'c1' });
    expect(deleteDoc.mock.calls).toEqual([[{ path: 'cooks/c1', id: 'c1' }]]);
  });

  it.each([
    ['the photo read', 'read'],
    ['the photo delete', 'delete'],
  ])('keeps the cook when %s fails, offline or denied', async (_label, step) => {
    const offline = Object.assign(new Error('offline'), { code: 'unavailable' });
    if (step === 'read') getDoc.mockRejectedValueOnce(offline);
    else deleteDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await expect(deleteCook('c1')).rejects.toThrow(step === 'read' ? 'offline' : 'denied');
    expect(deleteDoc.mock.calls.some(([ref]) => (ref as { path: string }).path === 'cooks/c1')).toBe(false);
  });
});

describe('addCookPhoto', () => {
  const url = 'data:image/jpeg;base64,' + 'A'.repeat(199_977);

  it('writes cookPhotos/{cookId} with exactly the rules keys', async () => {
    expect(url.length).toBe(200_000);
    await addCookPhoto('c1', 'r2', url);
    expect(setDoc).toHaveBeenCalledWith({ path: 'cookPhotos/c1', id: 'c1' }, { uid: 'sam', recipeId: 'r2', url, createdAt: 'SERVER_TS' });
  });

  it('refuses a URL over 200000 characters or not a JPEG data URL, writing nothing', async () => {
    await expect(addCookPhoto('c1', 'r2', url + 'A')).rejects.toThrow();
    await expect(addCookPhoto('c1', 'r2', 'data:image/png;base64,AAAA')).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('rejects after 15 s', async () => {
    setDoc.mockReturnValue(new Promise(() => {}));
    const p = addCookPhoto('c1', 'r2', url).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(((await p) as Error).message).toMatch(/timed out/);
  });
});

describe('getOwnCooksInFamily', () => {
  it('is one equality-only query on uid and rootId, limited to 30', async () => {
    queries.length = 0;
    const cooks = await getOwnCooksInFamily('u1', 'root');
    expect(cooks.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(queries).toEqual([[['where', 'uid', '==', 'u1'], ['where', 'rootId', '==', 'root'], ['limit', 30]]]);
  });
});

describe('getRecentCooks (RL-242)', () => {
  it('runs one range plus orderBy on createdAt, limit 500, and keeps only four fields', async () => {
    const out = await getRecentCooks(NOW - 1000);
    const q = queries[queries.length - 1];
    expect(q).toEqual([['where', 'createdAt', '>=', new Date(NOW - 1000)], ['orderBy', 'createdAt', 'desc'], ['limit', 500]]);
    expect(out[0]).toEqual({ recipeId: undefined, rootId: undefined, uid: 'u', createdAt: 5 });
    expect(Object.keys(out[0]).sort()).toEqual(['createdAt', 'recipeId', 'rootId', 'uid']);
  });

  it('rejects after 6 s, not 5', async () => {
    hangDocs = true;
    let settled = false;
    const p = getRecentCooks(NOW - 1000).catch((e: unknown) => {
      settled = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(((await p) as Error).message).toMatch(/timed out/);
  });
});

describe('getFamilyCooks (RL-245)', () => {
  it('runs rootId equality plus orderBy createdAt desc, limit 1000, and keeps four fields', async () => {
    const out = await getFamilyCooks('r1');
    expect(queries[queries.length - 1]).toEqual([['where', 'rootId', '==', 'r1'], ['orderBy', 'createdAt', 'desc'], ['limit', 1000]]);
    expect(Object.keys(out[0]).sort()).toEqual(['createdAt', 'recipeId', 'rootId', 'uid']);
  });

  it('rejects after 12 s, not 11', async () => {
    hangDocs = true;
    let settled = false;
    const p = getFamilyCooks('r1').catch((e: unknown) => {
      settled = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(11000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(((await p) as Error).message).toMatch(/timed out/);
  });
});
