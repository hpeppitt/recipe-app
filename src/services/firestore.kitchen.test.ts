import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KITCHEN_ITEM_CAP, KitchenFullError, type Item, type PantryItem } from '../lib/kitchen';

/**
 * RL-213: the kitchen service, mocked at the SDK boundary like the other
 * firestore.*.test.ts files. The rules side is RL-211's and is emulator-checked.
 */

type Op = { op: 'set' | 'update'; path: string; data: Record<string, unknown> };
let stored: Record<string, Record<string, unknown>> = {};
let ops: Op[] = [];
let hang = false;
type Write = { kind: string; path: string; data?: Record<string, unknown> };
let writes: Write[] = [];
let queries: unknown[][] = [];
let updateError: unknown = null;
const authState = vi.hoisted(() => ({ currentUser: { uid: 'u1' } as { uid: string } | null }));

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: authState, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), id: segments.at(-1) }),
  collection: (_db: unknown, path: string) => ({ path }),
  where: (...a: unknown[]) => ['where', ...a],
  limit: (n: number) => ['limit', n],
  query: (col: { path: string }, ...c: unknown[]) => ({ col: col.path, c }),
  getDocs: async (q: { col: string; c: unknown[] }) => {
    queries.push([q.col, ...q.c]);
    const docs = Object.entries(stored)
      .filter(([path]) => path.startsWith(`${q.col}/`))
      .filter(([, data]) =>
        q.c.every((c) => {
          const [kind, field, op, value] = c as [string, string, string, unknown];
          if (kind !== 'where') return true;
          return op === 'array-contains' ? (data[field] as unknown[]).includes(value) : data[field] === value;
        })
      )
      .map(([path, data]) => ({ id: path.split('/')[1], ref: { path }, data: () => data }));
    return { docs };
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => void writes.push({ kind: 'set', path: ref.path, data }),
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    if (updateError) throw updateError;
    writes.push({ kind: 'update', path: ref.path, data });
  },
  writeBatch: () => ({
    delete: (ref: { path: string }) => writes.push({ kind: 'delete', path: ref.path }),
    commit: async () => {},
  }),
  arrayUnion: (...v: unknown[]) => ({ arrayUnion: v }),
  arrayRemove: (...v: unknown[]) => ({ arrayRemove: v }),
  deleteField: () => 'DELETE_FIELD',
  serverTimestamp: () => 'SERVER_TS',
  getDoc: async (ref: { path: string }) => ({ exists: () => stored[ref.path] != null, data: () => stored[ref.path] }),
  onSnapshot: (ref: { path: string }, next: (s: unknown) => void) => {
    const data = stored[ref.path];
    next({ exists: () => data != null, data: () => data });
    return () => {};
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (hang) return new Promise(() => {});
    const staged: Op[] = [];
    await fn({
      get: async (ref: { path: string }) => {
        const data = stored[ref.path];
        return { exists: () => data != null, data: () => data };
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
    });
    ops = staged;
  },
}));

import {
  createKitchenInvite,
  findKitchenId,
  getKitchenInvite,
  getKitchenMembers,
  getKitchenOnce,
  joinKitchenWithInvite,
  KitchenJoinDeniedError,
  deleteKitchenInvites,
  leaveKitchen,
  removeKitchenMember,
  subscribeKitchen,
  updateKitchen,
} from './firestore';
import { isInviteCode, KITCHEN_INVITE_DAYS } from '../lib/kitchen';

const line = (id: string): Item => ({ id, name: id, amount: null, unit: null, aisle: 'Other', sources: [], done: false });
const pantryItem = (id: string): PantryItem => ({ id, name: id, group: 'cupboard', addedBy: 'u1', addedAt: 1 });

beforeEach(() => {
  stored = {};
  ops = [];
  hang = false;
  writes = [];
  queries = [];
  updateError = null;
  authState.currentUser = { uid: 'u1' };
});

describe('updateKitchen', () => {
  it('creates the document on first write with exactly the rules keys', async () => {
    await updateKitchen('u1', (k) => ({ ...k, shopping: [line('a')] }));
    expect(ops).toEqual([
      {
        op: 'set',
        path: 'kitchens/u1',
        data: { memberUids: ['u1'], ownerUid: 'u1', shopping: [line('a')], pantry: [], updatedAt: 'SERVER_TS' },
      },
    ]);
  });

  it('merges onto the stored lists and updates only shopping, pantry and updatedAt', async () => {
    stored['kitchens/u1'] = { memberUids: ['u1'], ownerUid: 'u1', shopping: [line('other-device')], pantry: [pantryItem('p')], updatedAt: null };
    await updateKitchen('u1', (k) => ({ ...k, shopping: [...k.shopping, line('mine')] }));
    expect(ops).toEqual([
      {
        op: 'update',
        path: 'kitchens/u1',
        data: { shopping: [line('other-device'), line('mine')], pantry: [pantryItem('p')], updatedAt: 'SERVER_TS' },
      },
    ]);
  });

  it('refuses a write past the item cap without writing', async () => {
    const full = Array.from({ length: KITCHEN_ITEM_CAP + 1 }, (_, i) => line(`l${i}`));
    await expect(updateKitchen('u1', (k) => ({ ...k, shopping: full }))).rejects.toBeInstanceOf(KitchenFullError);
    expect(ops).toEqual([]);
  });

  it('refuses a write past the size guard without writing', async () => {
    const big = [{ ...line('big'), name: 'x'.repeat(950_000) }];
    await expect(updateKitchen('u1', (k) => ({ ...k, shopping: big }))).rejects.toBeInstanceOf(KitchenFullError);
    expect(ops).toEqual([]);
  });

  it('rejects after 5 s when the transaction cannot reach the server', async () => {
    vi.useFakeTimers();
    hang = true;
    const p = updateKitchen('u1', (k) => k);
    const assertion = expect(p).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });

  it("updates a shared kitchen the user belongs to, leaving members, owner and joinCode as they are (RL-238)", async () => {
    stored['kitchens/owner1'] = { memberUids: ['owner1', 'u1'], ownerUid: 'owner1', joinCode: 'u1:x', shopping: [], pantry: [], updatedAt: null };
    await updateKitchen('owner1', (k) => ({ ...k, shopping: [line('a')] }));
    expect(ops).toEqual([{ op: 'update', path: 'kitchens/owner1', data: { shopping: [line('a')], pantry: [], updatedAt: 'SERVER_TS' } }]);
  });

  it("never creates another user's kitchen", async () => {
    await expect(updateKitchen('u2', (k) => k)).rejects.toThrow('no longer exists');
    expect(ops).toEqual([]);
  });

  it('allows a removal from a kitchen already past the cap', async () => {
    const over = Array.from({ length: KITCHEN_ITEM_CAP + 1 }, (_, i) => line(`l${i}`));
    stored['kitchens/u1'] = { memberUids: ['u1'], ownerUid: 'u1', shopping: over, pantry: [], updatedAt: null };
    await updateKitchen('u1', (k) => ({ ...k, shopping: k.shopping.slice(1) }));
    expect(ops[0].op).toBe('update');
  });

  it('refuses when signed out', async () => {
    authState.currentUser = null;
    await expect(updateKitchen('u1', (k) => k)).rejects.toThrow('Sign in');
  });
});

describe('subscribeKitchen', () => {
  it('passes null for a missing kitchen and the parsed document otherwise', () => {
    const seen: unknown[] = [];
    subscribeKitchen('u1', (k) => seen.push(k));
    stored['kitchens/u1'] = { memberUids: ['u1'], ownerUid: 'u1', shopping: [line('a')], pantry: [], updatedAt: { toMillis: () => 7 } };
    subscribeKitchen('u1', (k) => seen.push(k));
    expect(seen).toEqual([null, { memberUids: ['u1'], ownerUid: 'u1', shopping: [line('a')], pantry: [], updatedAt: 7 }]);
  });
});

describe('getKitchenOnce', () => {
  it('reads the document once, and gives null when there is none', async () => {
    expect(await getKitchenOnce('u1')).toBeNull();
    stored['kitchens/u1'] = { memberUids: ['u1'], ownerUid: 'u1', shopping: [], pantry: [pantryItem('salt')] };
    expect((await getKitchenOnce('u1'))?.pantry).toEqual([pantryItem('salt')]);
  });
});

describe('household sharing (RL-238)', () => {
  const CODE = 'abcdefghijklmnopqrst';
  const invite = { code: CODE, kitchenId: 'owner1', ownerUid: 'owner1', expiresAt: Date.now() + 60_000 };

  it('finds the shared kitchen over the own one, with a bounded array-contains query', async () => {
    expect(await findKitchenId('u1')).toBe('u1');
    stored['kitchens/u1'] = { memberUids: ['u1'] };
    stored['kitchens/owner1'] = { memberUids: ['owner1', 'u1'] };
    stored['kitchens/other'] = { memberUids: ['other'] };
    expect(await findKitchenId('u1')).toBe('owner1');
    expect(queries.at(-1)).toEqual(['kitchens', ['where', 'memberUids', 'array-contains', 'u1'], ['limit', 2]]);
  });

  it('creates an invite with exactly the rules keys, a valid random code and an expiry inside 7 days', async () => {
    const code = await createKitchenInvite('u1', 'x'.repeat(100));
    expect(isInviteCode(code)).toBe(true);
    expect(writes).toHaveLength(1);
    const { path, data } = writes[0];
    expect(path).toBe(`kitchenInvites/${code}`);
    expect(Object.keys(data!).sort()).toEqual(['createdAt', 'expiresAt', 'kitchenId', 'ownerName', 'ownerUid']);
    expect(data).toMatchObject({ kitchenId: 'u1', ownerUid: 'u1', createdAt: 'SERVER_TS' });
    expect((data!.ownerName as string).length).toBe(80);
    const ms = (data!.expiresAt as Date).getTime() - Date.now();
    expect(ms).toBeGreaterThan((KITCHEN_INVITE_DAYS - 1) * 86_400_000);
    expect(ms).toBeLessThan(KITCHEN_INVITE_DAYS * 86_400_000);
    expect(await createKitchenInvite('u1', '')).not.toBe(code);
  });

  it('reads an invite, or null when there is none', async () => {
    expect(await getKitchenInvite(CODE)).toBeNull();
    stored[`kitchenInvites/${CODE}`] = { kitchenId: 'owner1', ownerUid: 'owner1', ownerName: 'Ann', expiresAt: { toMillis: () => 99 } };
    expect(await getKitchenInvite(CODE)).toEqual({ code: CODE, kitchenId: 'owner1', ownerUid: 'owner1', expiresAt: 99 });
  });

  it('joins with arrayUnion of the own uid and joinCode, nothing else', async () => {
    await joinKitchenWithInvite(invite);
    expect(writes).toEqual([{ kind: 'update', path: 'kitchens/owner1', data: { memberUids: { arrayUnion: ['u1'] }, joinCode: `u1:${CODE}` } }]);
  });

  it('turns a denied join into KitchenJoinDeniedError', async () => {
    updateError = Object.assign(new Error('denied'), { code: 'permission-denied' });
    await expect(joinKitchenWithInvite(invite)).rejects.toBeInstanceOf(KitchenJoinDeniedError);
  });

  it("deletes the caller's own invites to one kitchen", async () => {
    stored['kitchenInvites/a'] = { kitchenId: 'u1', ownerUid: 'u1' };
    stored['kitchenInvites/b'] = { kitchenId: 'other', ownerUid: 'u1' };
    await deleteKitchenInvites('u1');
    expect(writes).toEqual([{ kind: 'delete', path: 'kitchenInvites/a' }]);
  });

  it('passes any other join failure through', async () => {
    updateError = Object.assign(new Error('unavailable'), { code: 'unavailable' });
    await expect(joinKitchenWithInvite(invite)).rejects.toThrow('unavailable');
  });

  it('leaves with arrayRemove of the own uid, updatedAt and joinCode cleared', async () => {
    await leaveKitchen('owner1');
    expect(writes).toEqual([
      { kind: 'update', path: 'kitchens/owner1', data: { memberUids: { arrayRemove: ['u1'] }, updatedAt: 'SERVER_TS', joinCode: 'DELETE_FIELD' } },
    ]);
  });

  it("removes a member after deleting the owner's live invites to that kitchen only", async () => {
    stored['kitchenInvites/a'] = { kitchenId: 'u1', ownerUid: 'u1' };
    stored['kitchenInvites/b'] = { kitchenId: 'elsewhere', ownerUid: 'u1' };
    stored['kitchenInvites/c'] = { kitchenId: 'u1', ownerUid: 'someone' };
    await removeKitchenMember('u1', 'u2');
    expect(queries.at(-1)).toEqual(['kitchenInvites', ['where', 'ownerUid', '==', 'u1']]);
    expect(writes).toEqual([
      { kind: 'delete', path: 'kitchenInvites/a' },
      { kind: 'update', path: 'kitchens/u1', data: { memberUids: { arrayRemove: ['u2'] }, updatedAt: 'SERVER_TS', joinCode: 'DELETE_FIELD' } },
    ]);
    await expect(removeKitchenMember('u1', 'u1')).rejects.toThrow('cannot remove themselves');
  });

  it('reads at most six member profiles, with nulls for a missing one', async () => {
    stored['profiles/a'] = { displayName: 'Ann', photoType: 'emoji', photoEmoji: '🍋', photoBgColor: '#fff', photoURL: null };
    const uids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const members = await getKitchenMembers(uids);
    expect(members.map((m) => m.uid)).toEqual(uids.slice(0, 6));
    expect(members[0]).toEqual({ uid: 'a', name: 'Ann', avatar: { photoType: 'emoji', photoEmoji: '🍋', photoBgColor: '#fff', photoURL: null } });
    expect(members[1]).toEqual({ uid: 'b', name: null, avatar: null });
  });
});
