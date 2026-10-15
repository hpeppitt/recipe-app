import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Firestore layer can't be exercised against a real backend here (no
 * credentials, and the emulator needs a JVM that isn't installed), so the SDK is
 * mocked at the module boundary. These tests pin the batching contract of
 * markAllNotificationsRead: Firestore rejects a batch of more than 500 writes,
 * so the unread set is committed in chunks of at most 500.
 */

const getDocs = vi.fn(async () => ({ docs: [] as unknown[] }));

type Fn = ReturnType<typeof vi.fn>;
type MockBatch = { set: Fn; update: Fn; delete: Fn; commit: Fn };
const batches: MockBatch[] = [];
let commitImpl: (batch: MockBatch) => Promise<void> = async () => {};

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: (...args: unknown[]) => getDocs(...(args as [])),
  setDoc: vi.fn(async () => {}),
  addDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  onSnapshot: vi.fn(() => () => {}),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => {
    const batch: MockBatch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => commitImpl(batch)),
    };
    batches.push(batch);
    return batch;
  },
  arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
}));

const { markAllNotificationsRead } = await import('./firestore');

const unreadDocs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ref: { path: `notifications/n${i}` } }));

beforeEach(() => {
  batches.length = 0;
  commitImpl = async () => {};
  getDocs.mockReset();
  getDocs.mockImplementation(async () => ({ docs: [] }));
});

describe('markAllNotificationsRead', () => {
  it('commits nothing when there are no unread notifications', async () => {
    getDocs.mockImplementationOnce(async () => ({ docs: [] }));

    await markAllNotificationsRead('me');

    expect(batches).toHaveLength(0);
  });

  it('commits exactly 500 unread in one batch', async () => {
    getDocs.mockImplementationOnce(async () => ({ docs: unreadDocs(500) }));

    await markAllNotificationsRead('me');

    expect(batches).toHaveLength(1);
    expect(batches[0].update).toHaveBeenCalledTimes(500);
    expect(batches[0].update).toHaveBeenCalledWith({ path: 'notifications/n0' }, { read: true });
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
  });

  it('splits 501 unread into two commits of 500 and 1', async () => {
    getDocs.mockImplementationOnce(async () => ({ docs: unreadDocs(501) }));

    await markAllNotificationsRead('me');

    expect(batches).toHaveLength(2);
    expect(batches[0].update).toHaveBeenCalledTimes(500);
    expect(batches[1].update).toHaveBeenCalledTimes(1);
    expect(batches[1].update).toHaveBeenCalledWith({ path: 'notifications/n500' }, { read: true });
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(batches[1].commit).toHaveBeenCalledTimes(1);
  });

  it('rejects when a later chunk fails, after the earlier chunk has committed', async () => {
    getDocs.mockImplementationOnce(async () => ({ docs: unreadDocs(501) }));
    commitImpl = async (batch) => {
      if (batches.indexOf(batch) === 1) throw new Error('permission-denied');
    };

    await expect(markAllNotificationsRead('me')).rejects.toThrow('permission-denied');

    expect(batches).toHaveLength(2);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(batches[1].commit).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed commit rather than swallowing it', async () => {
    getDocs.mockImplementationOnce(async () => ({ docs: unreadDocs(3) }));
    commitImpl = async () => {
      throw new Error('permission-denied');
    };

    await expect(markAllNotificationsRead('me')).rejects.toThrow('permission-denied');
  });
});
