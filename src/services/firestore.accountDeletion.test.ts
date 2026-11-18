import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The Firestore SDK is mocked with a small in-memory store, so a run can be checked end to end
// (what is gone, what is anonymised, what a second run finds) for two crossed users, a and b.
// `deny` stands in for the rules and `hang` for a write that never settles.
type Data = Record<string, unknown>;
type Ref = { path: string; id: string };
type Q = { col: string; wheres: Array<[string, string, unknown]> };

const store = new Map<string, Data>();
const log: string[] = [];
let deny: (op: 'list' | 'get' | 'delete' | 'update', path: string, q?: Q) => boolean = () => false;
let hang: (op: 'delete' | 'update', path: string) => boolean = () => false;
let offline = false;
let inFlight = 0;
let maxInFlight = 0;

const err = (code: string) => Object.assign(new Error(code), { code });
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
const field = (d: Data, f: string) => f.split('.').reduce<unknown>((v, k) => (v as Data | undefined)?.[k], d);
const ref = (path: string): Ref => ({ path, id: path.split('/').pop()! });
const snap = (path: string) => ({ id: ref(path).id, ref: ref(path), exists: () => store.has(path), data: () => structuredClone(store.get(path)) });

function patch(path: string, p: Data) {
  const cur = store.get(path);
  if (!cur) throw err('not-found');
  for (const [k, v] of Object.entries(p)) {
    const s = v as { __inc?: number; __remove?: unknown[]; __delete?: true; __ts?: true } | null;
    if (s && typeof s === 'object' && '__inc' in s) cur[k] = ((cur[k] as number) ?? 0) + s.__inc!;
    else if (s && typeof s === 'object' && '__remove' in s) cur[k] = (cur[k] as unknown[]).filter((x) => !s.__remove!.includes(x));
    else if (s && typeof s === 'object' && '__delete' in s) delete cur[k];
    else if (s && typeof s === 'object' && '__ts' in s) cur[k] = 'now';
    else cur[k] = structuredClone(v);
  }
}

/** A write that respects deny, hang and offline (an offline write never settles, as in the SDK). */
function write(op: 'delete' | 'update', path: string, apply: () => void): Promise<void> {
  if (offline || hang(op, path)) return new Promise(() => {});
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  return Promise.resolve().then(() => {
    inFlight--;
    if (deny(op, path)) throw err('permission-denied');
    apply();
    log.push(`${op} ${path}`);
  });
}

vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...s: string[]) => ref(s.join('/')),
  collection: (_db: unknown, ...s: string[]) => ({ col: s.join('/') }),
  where: (...a: unknown[]) => ({ where: a }),
  query: (c: { col: string }, ...cs: Array<{ where?: [string, string, unknown] }>) => ({ col: c.col, wheres: cs.flatMap((x) => (x.where ? [x.where] : [])) }),
  increment: (n: number) => ({ __inc: n }),
  arrayRemove: (...v: unknown[]) => ({ __remove: v }),
  deleteField: () => ({ __delete: true }),
  serverTimestamp: () => ({ __ts: true }),
  getDocsFromServer: async (q: Q) => {
    if (offline) throw err('unavailable');
    if (deny('list', q.col, q)) throw err('permission-denied');
    const docs = [...store.keys()]
      .filter((p) => parentOf(p) === q.col)
      .filter((p) => q.wheres.every(([f, op, v]) => (op === 'array-contains' ? ((field(store.get(p)!, f) as unknown[]) ?? []).includes(v) : field(store.get(p)!, f) === v)))
      .map(snap);
    return { docs };
  },
  getDocFromServer: async (r: Ref) => {
    if (offline) throw err('unavailable');
    if (deny('get', r.path)) throw err('permission-denied');
    return snap(r.path);
  },
  deleteDoc: (r: Ref) => write('delete', r.path, () => store.delete(r.path)),
  updateDoc: (r: Ref, p: Data) => write('update', r.path, () => patch(r.path, p)),
  writeBatch: () => {
    const ops: Array<() => void> = [];
    const paths: string[] = [];
    return {
      delete: (r: Ref) => {
        paths.push(r.path);
        ops.push(() => store.delete(r.path));
      },
      update: (r: Ref, p: Data) => {
        paths.push(r.path);
        ops.push(() => patch(r.path, p));
      },
      commit: () =>
        write('update', paths.join('+'), () => {
          // All or nothing, like a real batch.
          const before = new Map([...store].map(([k, v]) => [k, structuredClone(v)]));
          try {
            ops.forEach((o) => o());
          } catch (e) {
            store.clear();
            before.forEach((v, k) => store.set(k, v));
            throw e;
          }
        }),
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const ops: Array<() => void> = [];
    let path = '';
    const out = await fn({
      get: async (r: Ref) => snap(r.path),
      update: (r: Ref, p: Data) => {
        path = r.path;
        ops.push(() => patch(r.path, p));
      },
    });
    if (ops.length) await write('update', path, () => ops.forEach((o) => o()));
    return out;
  },
}));

const { deleteAccountData } = await import('./firestore');
const { DELETION_STEPS } = await import('../lib/accountDeletion');

function seed() {
  const put = (path: string, d: Data) => store.set(path, d);
  put('profiles/a', { displayName: 'A', followerCount: 1, followingCount: 1 });
  put('profiles/b', { displayName: 'B', followerCount: 1, followingCount: 1 });
  put('recipes/ra1', { createdBy: { uid: 'a' }, favoriteCount: 1 });
  put('recipes/ra2', { createdBy: { uid: 'a' }, favoriteCount: 0, parentId: 'ra1' });
  put('recipes/rb1', { createdBy: { uid: 'b' }, favoriteCount: 1 });
  put('cooks/ca', { uid: 'a', recipeId: 'rb1' });
  put('cookPhotos/ca', { uid: 'a', recipeId: 'rb1' });
  put('cooks/cb', { uid: 'b', recipeId: 'ra1' });
  put('favorites/a_rb1', { uid: 'a', recipeId: 'rb1', recipeOwnerId: 'b' });
  put('favorites/b_ra1', { uid: 'b', recipeId: 'ra1', recipeOwnerId: 'a' });
  put('follows/a_b', { followerId: 'a', followingId: 'b' });
  put('follows/b_a', { followerId: 'b', followingId: 'a' });
  put('collections/cb', { ownerUid: 'b', visibility: 'public', followerCount: 1 });
  put('collections/ca', { ownerUid: 'a', visibility: 'private' });
  put('cookbookFollows/a_cb', { uid: 'a', collectionId: 'cb' });
  // b suggests on a's recipe; a suggests on b's; a suggests on their own (a residual).
  put('suggestions/s1', { recipeOwnerId: 'a', suggestedBy: { uid: 'b', displayName: 'B' } });
  put('suggestions/s1/messages/m1', { fromUid: 'b', fromDisplayName: 'B', text: 'hi' });
  put('suggestions/s1/messages/m2', { fromUid: 'a', fromDisplayName: 'A', text: 'thanks' });
  put('suggestions/s2', { recipeOwnerId: 'b', suggestedBy: { uid: 'a', displayName: 'A' } });
  put('suggestions/s2/messages/m3', { fromUid: 'a', fromDisplayName: 'A', text: 'try this' });
  put('suggestions/s3', { recipeOwnerId: 'a', suggestedBy: { uid: 'a', displayName: 'A' } });
  put('notifications/n1', { recipientUid: 'a', fromUid: 'b' });
  put('notifications/n2', { recipientUid: 'b', fromUid: 'a' });
  put('kitchens/a', { ownerUid: 'a', memberUids: ['a'], pantry: [], shopping: [] });
  put('kitchens/b', { ownerUid: 'b', memberUids: ['b', 'a'], pantry: [{ id: 'p1', addedBy: 'a' }, { id: 'p2', addedBy: 'b' }], shopping: [] });
  put('kitchenInvites/codeA', { ownerUid: 'a', kitchenId: 'a' });
  put('feedback/f1', { uid: 'a' });
  put('notificationPrefs/a', {});
  put('tasteProfiles/a', {});
  put('termsAcceptance/a', {});
  put('termsAcceptance/b', {});
}

const counts = (r: Awaited<ReturnType<typeof deleteAccountData>>) => {
  if (r.status !== 'ran') throw new Error(r.status);
  return Object.fromEntries(r.steps.map((s) => [s.step, s]));
};

beforeEach(() => {
  store.clear();
  log.length = 0;
  deny = () => false;
  hang = () => false;
  offline = false;
  inFlight = 0;
  maxInFlight = 0;
  seed();
});
afterEach(() => vi.useRealTimers());

describe('deleteAccountData', () => {
  it('runs every step in order and leaves b with an anonymised trace of a', async () => {
    const r = await deleteAccountData('a');
    if (r.status !== 'ran') throw new Error(r.status);
    expect(r.steps.map((s) => s.step)).toEqual([...DELETION_STEPS]);
    expect(r.failed).toBe(0);
    const c = counts(r);
    expect(c.recipes.done).toBe(2);
    expect(c.suggestionReplies.done).toBe(2);
    expect(c.suggestions.done).toBe(3);
    expect(c.profile.done).toBe(1);

    // Nothing of a's own is left.
    const left = [...store.keys()].filter((p) => /\/a$|\/a_|recipes\/ra|\/ca$|codeA|f1|n1|n2/.test(p));
    expect(left).toEqual([]);
    // b's things survive, with a anonymised.
    expect(store.get('suggestions/s1')).toMatchObject({ recipeOwnerId: 'deleted-user', suggestedBy: { uid: 'b' } });
    expect(store.get('suggestions/s1/messages/m1')).toMatchObject({ fromUid: 'b', text: 'hi' });
    expect(store.get('suggestions/s1/messages/m2')).toEqual({ fromUid: 'deleted-user', fromDisplayName: null, text: 'thanks' });
    expect(store.get('suggestions/s2')).toMatchObject({ recipeOwnerId: 'b', suggestedBy: { uid: 'deleted-user', displayName: null } });
    expect(store.get('suggestions/s3')).toMatchObject({ recipeOwnerId: 'deleted-user', suggestedBy: { uid: 'deleted-user' } });
    expect(store.get('kitchens/b')).toMatchObject({ memberUids: ['b'], pantry: [{ id: 'p1', addedBy: 'deleted-user' }, { id: 'p2', addedBy: 'b' }] });
    expect(store.get('recipes/rb1')?.favoriteCount).toBe(0);
    expect(store.get('profiles/b')?.followerCount).toBe(0);
    expect(store.get('collections/cb')?.followerCount).toBe(0);
    expect(store.has('cooks/cb') && store.has('termsAcceptance/b') && store.has('recipes/rb1')).toBe(true);

    // Write order: photo before cook, a reply before its parent, pantry before leaving, profile last.
    const at = (s: string) => log.findIndex((l) => l.includes(s));
    expect(at('cookPhotos/ca')).toBeLessThan(at('delete cooks/ca'));
    expect(at('messages/m2')).toBeLessThan(log.indexOf('update suggestions/s1'));
    expect(at('messages/m3')).toBeLessThan(log.indexOf('update suggestions/s2'));
    expect(log.filter((l) => l === 'update kitchens/b')).toHaveLength(2);
    expect(log[log.length - 1]).toBe('delete profiles/a');
  });

  it('returns all zeros on a second run', async () => {
    await deleteAccountData('a');
    log.length = 0;
    const r = await deleteAccountData('a');
    if (r.status !== 'ran') throw new Error(r.status);
    expect(r.steps.every((s) => s.done === 0 && s.failed === 0 && !s.skipped)).toBe(true);
    expect(log).toEqual([]);
  });

  it('is blocked, touching nothing, when a owns a kitchen b is in', async () => {
    store.set('kitchens/a', { ownerUid: 'a', memberUids: ['a', 'b'], pantry: [], shopping: [] });
    const before = JSON.stringify([...store]);
    expect(await deleteAccountData('a')).toEqual({ status: 'blocked', reason: 'shared-kitchen' });
    expect(JSON.stringify([...store])).toBe(before);
  });

  it('under pre-149.1 rules is partial and keeps the profile', async () => {
    // The old rules refused the sender's notification list, the follow delete by the followed user,
    // feedback deletes and every anonymising update.
    deny = (op, path, q) =>
      (op === 'list' && path === 'notifications' && q?.wheres[0][0] === 'fromUid') ||
      (op === 'delete' && (path === 'follows/b_a' || path.startsWith('feedback/'))) ||
      (op === 'update' && path.startsWith('suggestions/'));
    const r = await deleteAccountData('a');
    if (r.status !== 'ran') throw new Error(r.status);
    const c = counts(r);
    expect(r.failed).toBeGreaterThan(0);
    expect(c.notificationsSent.failed).toBe(1);
    expect(c.followsAsFollowed.failed).toBe(1);
    expect(c.feedback.failed).toBe(1);
    expect(c.suggestionReplies.failed).toBe(2);
    // Replies not anonymised, so their parents wait; s3 has no replies of a's and goes ahead (and is denied).
    expect(c.suggestions).toMatchObject({ done: 0, failed: 3 });
    expect(c.profile).toMatchObject({ skipped: true });
    expect(store.has('profiles/a')).toBe(true);
    expect(store.has('recipes/ra1')).toBe(false);
  });

  it('offline: reads fail, nothing is deleted, and it still resolves', async () => {
    offline = true;
    const before = JSON.stringify([...store]);
    const r = await deleteAccountData('a');
    expect(r.status).toBe('ran');
    if (r.status === 'ran') expect(r.failed).toBeGreaterThan(0);
    expect(JSON.stringify([...store])).toBe(before);
  });

  it('bounds a write that never settles', async () => {
    vi.useFakeTimers();
    hang = (op, path) => op === 'delete' && path.startsWith('recipes/');
    const pending = deleteAccountData('a');
    await vi.advanceTimersByTimeAsync(60_000);
    const r = await pending;
    const c = counts(r);
    expect(c.recipes).toEqual({ step: 'recipes', done: 0, failed: 2 });
    expect(c.profile).toMatchObject({ skipped: true });
  });

  it('writes at most 10 at a time', async () => {
    for (let i = 0; i < 25; i++) store.set(`recipes/x${i}`, { createdBy: { uid: 'a' }, favoriteCount: 0 });
    const r = await deleteAccountData('a');
    expect(counts(r).recipes.done).toBe(27);
    expect(maxInFlight).toBeLessThanOrEqual(10);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('leaves a suggestion as it is when one of its replies could not be anonymised', async () => {
    deny = (op, path) => op === 'update' && path === 'suggestions/s2/messages/m3';
    const c = counts(await deleteAccountData('a'));
    expect(c.suggestions).toMatchObject({ done: 2, failed: 1 });
    expect(store.get('suggestions/s2')).toMatchObject({ suggestedBy: { uid: 'a' } });
    expect(store.has('profiles/a')).toBe(true);
  });
});
