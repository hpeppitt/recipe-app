import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * subscribeOwnRecipes feeds a sync that treats every snapshot as the complete list of the
 * user's recipes, so a snapshot from the cache or with pending writes must never reach it.
 */

type Snap = {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  docs: { id: string; data: () => Record<string, unknown> }[];
};
let next: ((snap: Snap) => void) | null = null;
const unsubscribe = vi.fn();
const onSnapshot = vi.fn((_q: unknown, _opts: unknown, onNext: (s: Snap) => void) => {
  next = onNext;
  return unsubscribe;
});

vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ path: name }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  onSnapshot: (...a: unknown[]) => onSnapshot(...(a as [unknown, unknown, (s: Snap) => void])),
  arrayUnion: vi.fn(),
}));

const { subscribeOwnRecipes } = await import('./firestore');

const snap = (fromCache: boolean, hasPendingWrites: boolean): Snap => ({
  metadata: { fromCache, hasPendingWrites },
  docs: [{ id: 'r1', data: () => ({ title: 'Soup' }) }],
});

beforeEach(() => {
  next = null;
  onSnapshot.mockClear();
});

describe('subscribeOwnRecipes', () => {
  it('opens one equality query on createdBy.uid with no orderBy and returns its unsubscribe', () => {
    const stop = subscribeOwnRecipes('me', vi.fn(), vi.fn());

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    const [q] = onSnapshot.mock.calls[0] as unknown as [unknown[]];
    expect(q).toEqual([{ path: 'recipes' }, { where: ['createdBy.uid', '==', 'me'] }]);
    expect(stop).toBe(unsubscribe);
  });

  it('passes on a server snapshot as { id, ...data }', () => {
    const onDocs = vi.fn();
    subscribeOwnRecipes('me', onDocs, vi.fn());

    next!(snap(false, false));

    expect(onDocs).toHaveBeenCalledWith([{ id: 'r1', title: 'Soup' }]);
  });

  it('never passes on a snapshot from the cache or with pending writes', () => {
    const onDocs = vi.fn();
    subscribeOwnRecipes('me', onDocs, vi.fn());

    next!(snap(true, false));
    next!(snap(false, true));
    next!(snap(true, true));

    expect(onDocs).not.toHaveBeenCalled();
  });
});
