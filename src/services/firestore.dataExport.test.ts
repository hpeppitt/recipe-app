import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore is mocked at the module boundary, as in the other service tests. Queries are
// recorded as plain data so each can be checked against the filter the read rule needs.
type Q = { col: string; wheres: unknown[][]; after?: unknown; limit?: number };
const queries: Q[] = [];
let getDocsImpl: (q: Q) => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>;
let getDocImpl: (path: string) => Promise<{ id: string; exists: () => boolean; data: () => Record<string, unknown> }>;
const writes = vi.fn();

vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...s: string[]) => ({ path: s.join('/') }),
  collection: (_db: unknown, ...s: string[]) => ({ col: s.join('/') }),
  where: (...a: unknown[]) => ({ where: a }),
  limit: (n: number) => ({ limit: n }),
  startAfter: (d: unknown) => ({ after: d }),
  orderBy: vi.fn(),
  query: (c: { col: string }, ...cs: Array<{ where?: unknown[]; limit?: number; after?: unknown }>) => ({
    col: c.col,
    wheres: cs.flatMap((x) => (x.where ? [x.where] : [])),
    after: cs.find((x) => x.after)?.after,
    limit: cs.find((x) => x.limit)?.limit,
  }),
  getDocs: (q: Q) => {
    queries.push(q);
    return getDocsImpl(q);
  },
  getDoc: (r: { path: string }) => getDocImpl(r.path),
  setDoc: writes,
  updateDoc: writes,
  deleteDoc: writes,
  addDoc: writes,
  writeBatch: writes,
  runTransaction: writes,
}));

const { fetchCloudDataForExport } = await import('./firestore');

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, data: () => ({ createdAt: 1, ...extra }) });
const missing = (path: string) => ({ id: path.split('/').pop()!, exists: () => false, data: () => ({}) });

beforeEach(() => {
  queries.length = 0;
  writes.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getDocsImpl = async () => ({ docs: [] });
  getDocImpl = async (path) => missing(path);
});

describe('fetchCloudDataForExport', () => {
  it('uses the filters the read rules authorise and writes nothing', async () => {
    await fetchCloudDataForExport('u1');
    const shapes = queries.map((q) => `${q.col}:${q.wheres.map((w) => w[0]).join(',')}`).sort();
    expect(shapes).toEqual([
      'collections:ownerUid',
      'cookPhotos:uid',
      'cookbookFollows:uid',
      'cooks:uid',
      'favorites:uid',
      'follows:followerId',
      'follows:followingId',
      'kitchens:memberUids',
      'notifications:recipientUid',
      'recipes:createdBy.uid',
      'suggestions:recipeOwnerId',
      'suggestions:suggestedBy.uid',
    ]);
    expect(queries.every((q) => q.wheres.every((w) => (q.col === 'kitchens' ? w[1] === 'array-contains' : w[1] === '==') && w[2] === 'u1'))).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });

  it('includes bio and country from the profile document', async () => {
    getDocImpl = async (path) => (path === 'profiles/u1' ? { id: 'u1', exists: () => true, data: () => ({ displayName: 'A', bio: 'Hello', country: 'AU' }) } : missing(path));
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.profile && out.profile.data).toMatchObject({ uid: 'u1', bio: 'Hello', country: 'AU' });
  });

  it('merges the two suggestion queries without duplicates and reads each thread by path', async () => {
    getDocsImpl = async (q) => {
      if (q.col === 'suggestions') return { docs: [row('s1', { recipeOwnerId: 'u1' }), q.wheres[0][0] === 'recipeOwnerId' ? row('s2') : row('s1')] };
      if (q.col === 'suggestions/s1/messages') return { docs: [row('m1', { text: 'hi' })] };
      return { docs: [] };
    };
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.suggestions && out.suggestions.data.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(queries.map((q) => q.col)).toContain('suggestions/s1/messages');
    const s1 = 'data' in out.suggestions ? out.suggestions.data.find((s) => s.id === 's1') : undefined;
    expect(s1?.messages).toHaveLength(1);
  });

  it("returns the user's cooks and cook photos, and never logs a photo's data URL", async () => {
    const url = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    getDocsImpl = async (q) => {
      if (q.col === 'cooks') return { docs: [row('k1', { uid: 'u1', recipeOwnerId: 'o1', vote: 'again' })] };
      if (q.col === 'cookPhotos') return { docs: [row('k1', { uid: 'u1', recipeId: 'r1', url })] };
      return { docs: [] };
    };
    const log = vi.spyOn(console, 'log');
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.cooks && out.cooks.data).toEqual([{ id: 'k1', createdAt: 1, uid: 'u1', recipeOwnerId: 'o1', vote: 'again' }]);
    expect('data' in out.cookPhotos && out.cookPhotos.data[0].url).toBe(url);
    const logged = JSON.stringify([...log.mock.calls, ...vi.mocked(console.error).mock.calls]);
    expect(logged).not.toContain('base64');
  });

  it('reads kitchens/{uid} by id and the collections by ownerUid, and skips both for an unverified email', async () => {
    getDocImpl = async (path) => (path === 'kitchens/u1' ? { id: 'u1', exists: () => true, data: () => ({ ownerUid: 'u1', memberUids: ['u1'], shopping: [], pantry: [], updatedAt: 1 }) } : missing(path));
    getDocsImpl = async (q) => ({ docs: q.col === 'collections' ? [row('c1', { ownerUid: 'u1', name: 'Dinner' })] : [] });
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.kitchen && out.kitchen.data).toMatchObject({ id: 'u1', ownerUid: 'u1' });
    expect('data' in out.collections && out.collections.data.map((c) => c.id)).toEqual(['c1']);
    queries.length = 0;
    const unverified = await fetchCloudDataForExport('u1', false);
    expect('error' in unverified.kitchen && 'error' in unverified.collections).toBe(true);
    expect(queries.some((q) => q.col === 'collections')).toBe(false);
    expect('error' in unverified.kitchenMemberships).toBe(true);
    expect(queries.some((q) => q.col === 'kitchens')).toBe(false);
  });

  it('reads kitchen memberships with memberUids array-contains the uid (RL-238)', async () => {
    getDocsImpl = async (q) => ({ docs: q.col === 'kitchens' ? [row('owner1', { ownerUid: 'owner1', memberUids: ['owner1', 'u1'] })] : [] });
    const out = await fetchCloudDataForExport('u1');
    expect(queries.find((q) => q.col === 'kitchens')?.wheres).toEqual([['memberUids', 'array-contains', 'u1']]);
    expect('data' in out.kitchenMemberships && out.kitchenMemberships.data).toMatchObject([{ id: 'owner1', ownerUid: 'owner1' }]);
  });

  it('keeps the cook photo pages that arrived when the deadline passes', async () => {
    vi.useFakeTimers();
    getDocsImpl = (q) => {
      if (q.col !== 'cookPhotos') return Promise.resolve({ docs: [] });
      if (q.after) return new Promise(() => {});
      return Promise.resolve({ docs: Array.from({ length: 500 }, (_, i) => row(`p${i}`, { uid: 'u1' })) });
    };
    const p = fetchCloudDataForExport('u1');
    await vi.advanceTimersByTimeAsync(30001);
    const out = await p;
    vi.useRealTimers();
    expect('data' in out.cookPhotos && out.cookPhotos.data).toHaveLength(500);
    expect('warning' in out.cookPhotos && out.cookPhotos.warning).toMatch(/timed out/);
  });

  it('turns a failed cook photo read into that section error alone', async () => {
    getDocsImpl = async (q) => {
      if (q.col === 'cookPhotos') throw Object.assign(new Error('x'), { code: 'unavailable' });
      return { docs: q.col === 'cooks' ? [row('k1')] : [] };
    };
    const out = await fetchCloudDataForExport('u1');
    expect(out.cookPhotos).toEqual({ error: 'unavailable' });
    expect('data' in out.cooks && out.cooks.data).toHaveLength(1);
  });

  it('turns a rejected read into that section error and still returns the rest', async () => {
    getDocsImpl = async (q) => {
      if (q.col === 'favorites') throw Object.assign(new Error('x'), { code: 'permission-denied' });
      return { docs: [row('n1')] };
    };
    const out = await fetchCloudDataForExport('u1');
    expect(out.favorites).toEqual({ error: 'permission-denied' });
    expect('data' in out.notifications && out.notifications.data).toHaveLength(1);
  });

  it('keeps the rows of a half-failed merge and warns', async () => {
    getDocsImpl = async (q) => {
      if (q.col === 'follows' && q.wheres[0][0] === 'followingId') throw new Error('nope');
      return { docs: q.col === 'follows' ? [row('a_b')] : [] };
    };
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.follows && out.follows.data).toHaveLength(1);
    expect('warning' in out.follows && out.follows.warning).toMatch(/1 of 2 reads failed/);
  });

  it('turns a hung read into a timeout error', async () => {
    vi.useFakeTimers();
    getDocImpl = () => new Promise(() => {});
    const p = fetchCloudDataForExport('u1');
    await vi.advanceTimersByTimeAsync(30001);
    const out = await p;
    vi.useRealTimers();
    expect(out.profile).toEqual({ error: 'Reading profile timed out' });
    expect(out.termsAcceptance).toEqual({ error: 'Reading termsAcceptance timed out' });
    expect('data' in out.favorites).toBe(true);
  });

  it('pages through large results and reports a cap instead of truncating silently', async () => {
    getDocsImpl = async (q) => {
      if (q.col !== 'notifications') return { docs: [] };
      return { docs: Array.from({ length: 500 }, (_, i) => row(`n${queries.length}-${i}`)) };
    };
    const out = await fetchCloudDataForExport('u1');
    // 20 full pages, then a one-row peek that finds more.
    const nq = queries.filter((q) => q.col === 'notifications');
    expect(nq).toHaveLength(21);
    expect(nq.every((q, i) => (i === 0) === (q.after === undefined))).toBe(true);
    expect(nq[20].limit).toBe(1);
    expect('warning' in out.notifications && out.notifications.warning).toMatch(/Stopped after 10000/);
  });

  it('reads the six own writeWindows ids and the profile, terms, notificationPrefs, tasteProfiles and kitchen by id', async () => {
    const paths: string[] = [];
    getDocImpl = async (p) => (paths.push(p), missing(p));
    await fetchCloudDataForExport('u1');
    expect(paths.sort()).toEqual([
      'kitchens/u1', 'notificationPrefs/u1', 'profiles/u1', 'tasteProfiles/u1', 'termsAcceptance/u1', 'writeWindows/u1_cook', 'writeWindows/u1_cookbook', 'writeWindows/u1_notification', 'writeWindows/u1_recipe', 'writeWindows/u1_reply', 'writeWindows/u1_suggestion',
    ]);
  });

  it('reports the verify note for tasteProfiles when the email is unverified, without reading it', async () => {
    const paths: string[] = [];
    getDocImpl = async (p) => (paths.push(p), missing(p));
    const out = await fetchCloudDataForExport('u1', false);
    expect(out.tasteProfile).toEqual({ error: 'Verify your email to include all your online data' });
    expect(paths).not.toContain('tasteProfiles/u1');
  });

  it('reports the verify note for notificationPrefs when the email is unverified, without reading it', async () => {
    const paths: string[] = [];
    getDocImpl = async (p) => (paths.push(p), missing(p));
    const out = await fetchCloudDataForExport('u1', false);
    expect(out.notificationPrefs).toEqual({ error: 'Verify your email to include all your online data' });
    expect(paths).not.toContain('notificationPrefs/u1');
  });

  it('does not report truncation for exactly 10000 rows', async () => {
    let served = 0;
    getDocsImpl = async (q) => {
      if (q.col !== 'notifications') return { docs: [] };
      const n = Math.min(q.limit ?? 0, 10000 - served);
      served += n;
      return { docs: Array.from({ length: n }, (_, i) => row(`n${served}-${i}`)) };
    };
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.notifications && out.notifications.data).toHaveLength(10000);
    expect('warning' in out.notifications).toBe(false);
  });

  it('skips suggestions for an unverified user with a plain note, and reads the rest', async () => {
    const out = await fetchCloudDataForExport('u1', false);
    expect(out.suggestions).toEqual({ error: 'Verify your email to include all your online data' });
    expect(queries.some((q) => q.col === 'suggestions')).toBe(false);
    expect(queries.some((q) => q.col === 'favorites')).toBe(true);
  });

  it('reads reply threads at most 10 at a time', async () => {
    let active = 0;
    let peak = 0;
    getDocsImpl = async (q) => {
      if (q.col === 'suggestions') return { docs: q.wheres[0][0] === 'recipeOwnerId' ? Array.from({ length: 25 }, (_, i) => row(`s${i}`)) : [] };
      if (q.col.endsWith('/messages')) {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
      }
      return { docs: [] };
    };
    await fetchCloudDataForExport('u1');
    expect(peak).toBe(10);
  });

  it('returns the suggestions and threads read so far when the deadline passes', async () => {
    vi.useFakeTimers();
    getDocsImpl = async (q) => {
      if (q.col === 'suggestions') return { docs: q.wheres[0][0] === 'recipeOwnerId' ? Array.from({ length: 12 }, (_, i) => row(`s${i}`)) : [] };
      if (q.col === 'suggestions/s10/messages' || q.col === 'suggestions/s11/messages') return new Promise(() => {});
      return { docs: q.col.endsWith('/messages') ? [row('m', { text: 'hi' })] : [] };
    };
    const p = fetchCloudDataForExport('u1');
    await vi.advanceTimersByTimeAsync(30001);
    const out = await p;
    vi.useRealTimers();
    const sec = out.suggestions as { data: Array<{ id: string; messages: unknown[] }>; warning: string };
    expect(sec.data).toHaveLength(12);
    expect(sec.data[0].messages).toHaveLength(1);
    expect(sec.data[11].messages).toHaveLength(0);
    expect(sec.warning).toMatch(/timed out/);
  });

  it('converts nested Timestamps and leaves other values alone', async () => {
    const ts = { toDate: () => new Date('2026-01-02T03:04:05.000Z') };
    getDocImpl = async (path) =>
      path.startsWith('termsAcceptance')
        ? { id: 'u1', exists: () => true, data: () => ({ a: ts, nested: { b: [ts, 1, 'x'] }, n: null }) }
        : missing(path);
    const out = await fetchCloudDataForExport('u1');
    expect('data' in out.termsAcceptance && out.termsAcceptance.data).toEqual({
      id: 'u1', a: '2026-01-02T03:04:05.000Z', nested: { b: ['2026-01-02T03:04:05.000Z', 1, 'x'] }, n: null,
    });
  });
});
