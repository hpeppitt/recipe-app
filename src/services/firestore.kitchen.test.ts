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
const authState = vi.hoisted(() => ({ currentUser: { uid: 'u1' } as { uid: string } | null }));

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: authState, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/'), id: segments.at(-1) }),
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

import { getKitchenOnce, subscribeKitchen, updateKitchen } from './firestore';

const line = (id: string): Item => ({ id, name: id, amount: null, unit: null, aisle: 'Other', sources: [], done: false });
const pantryItem = (id: string): PantryItem => ({ id, name: id, group: 'cupboard', addedBy: 'u1', addedAt: 1 });

beforeEach(() => {
  stored = {};
  ops = [];
  hang = false;
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

  it("refuses another user's kitchen", async () => {
    await expect(updateKitchen('u2', (k) => k)).rejects.toThrow('own kitchen');
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
