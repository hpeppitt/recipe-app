import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mocked at the SDK boundary, as in firestore.favorites.test.ts. Pins the RL-023
 * contract: only the caller's own published docs are attempted, so another user's
 * descendant (which the rules deny) is never reported as a failure.
 */

type Doc = { id: string; data: () => Record<string, unknown> };
let treeDocs: Doc[] = [];
// Docs reachable by id but not by the rootId query, e.g. a rootId never backfilled.
let looseDocs: Record<string, Record<string, unknown>> = {};
const deleteDoc = vi.fn(async (_ref: { path: string }) => {});

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  isFirebaseConfigured: true,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDocs: vi.fn(async () => ({ docs: treeDocs })),
  getDoc: async (ref: { path: string }) => {
    const data = looseDocs[ref.path.replace('recipes/', '')];
    return { exists: () => data !== undefined, data: () => data };
  },
  deleteDoc: (ref: { path: string }) => deleteDoc(ref),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
}));

const { deletePublishedRecipeTree } = await import('./firestore');

const node = (id: string, parentId: string | null, uid: string): Doc => ({
  id,
  data: () => ({ parentId, rootId: 'root', createdBy: { uid } }),
});

beforeEach(() => {
  deleteDoc.mockReset();
  deleteDoc.mockImplementation(async () => {});
  treeDocs = [
    node('root', null, 'alice'),
    node('own-child', 'root', 'alice'),
    node('foreign-child', 'root', 'bob'),
  ];
  looseDocs = {};
});

describe('deletePublishedRecipeTree', () => {
  it('skips a foreign descendant and counts only the own delete that rejects', async () => {
    deleteDoc.mockImplementation(async (ref) => {
      if (ref.path === 'recipes/own-child') throw new Error('unavailable');
    });

    const result = await deletePublishedRecipeTree('alice', 'root', 'root');

    expect(result).toEqual({ deleted: 1, failed: 1 });
    const paths = deleteDoc.mock.calls.map(([ref]) => ref.path);
    expect(paths).not.toContain('recipes/foreign-child');
  });

  it('still attempts ids known only from extraIds when they have an own cloud doc', async () => {
    looseDocs = { 'local-only': { createdBy: { uid: 'alice' } } };
    await deletePublishedRecipeTree('alice', 'root', 'root', ['root', 'local-only']);

    const paths = deleteDoc.mock.calls.map(([ref]) => ref.path).sort();
    expect(paths).toEqual(['recipes/local-only', 'recipes/own-child', 'recipes/root']);
  });

  it('does not attempt a foreign id even when the caller passes it in extraIds', async () => {
    await deletePublishedRecipeTree('alice', 'root', 'root', ['foreign-child']);

    const paths = deleteDoc.mock.calls.map(([ref]) => ref.path);
    expect(paths).not.toContain('recipes/foreign-child');
  });

  // The rules deny a delete of a missing doc, so attempting one would report a
  // phantom failure that "Try again" could never clear.
  it('skips an extraIds entry with no cloud doc instead of counting it failed', async () => {
    deleteDoc.mockImplementation(async (ref) => {
      if (ref.path === 'recipes/never-published') throw new Error('permission-denied');
    });

    const result = await deletePublishedRecipeTree('alice', 'root', 'root', ['never-published']);

    expect(result).toEqual({ deleted: 2, failed: 0 });
  });

  it('skips an extraIds entry whose cloud doc belongs to someone else', async () => {
    looseDocs = { stray: { createdBy: { uid: 'bob' } } };
    await deletePublishedRecipeTree('alice', 'root', 'root', ['stray']);

    const paths = deleteDoc.mock.calls.map(([ref]) => ref.path);
    expect(paths).not.toContain('recipes/stray');
  });
});
