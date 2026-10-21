import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cook } from '../types/social';

/** RL-206: getRecipePhoto, mocked at the SDK boundary like firestore.cooks.test.ts. */
const J = 'data:image/jpeg;base64,AAAA';
let photos: { id: string; url: unknown }[] = [];
let cooksThatExist: Record<string, string | null> = {};
const getDoc = vi.fn(async (ref: { path: string }) => {
  const id = ref.path.split('/')[1];
  return { exists: () => id in cooksThatExist, data: () => ({ displayName: cooksThatExist[id] }) };
});
const queries: unknown[][] = [];

vi.mock('./firebase', () => ({ firestore: { __mock: true }, auth: {}, isFirebaseConfigured: true }));
vi.mock('./telemetry', () => ({ reportError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  startAfter: (d: { id: string }) => ['startAfter', d.id],
  where: (...a: unknown[]) => ['where', ...a],
  orderBy: (...a: unknown[]) => ['orderBy', ...a],
  limit: (n: number) => ['limit', n],
  query: (c: { path: string }, ...constraints: unknown[]) => {
    queries.push([c.path, ...constraints]);
    return constraints;
  },
  getDocs: async () => {
    const after = (queries.at(-1)?.find((c) => Array.isArray(c) && c[0] === 'startAfter') as string[] | undefined)?.[1];
    const rest = after ? photos.slice(photos.findIndex((p) => p.id === after) + 1) : photos;
    return { docs: rest.slice(0, 1).map((p) => ({ id: p.id, data: () => ({ url: p.url }) })) };
  },
  getDoc: (ref: { path: string }) => getDoc(ref),
}));

const { getRecipePhoto } = await import('./firestore');

beforeEach(() => {
  photos = [];
  cooksThatExist = {};
  queries.length = 0;
  getDoc.mockClear();
});

describe('getRecipePhoto', () => {
  it('queries the newest photo of the recipe', async () => {
    expect(await getRecipePhoto('r1')).toBeNull();
    expect(queries[0]).toEqual(['cookPhotos', ['where', 'recipeId', '==', 'r1'], ['orderBy', 'createdAt', 'desc'], ['limit', 1]]);
  });

  it('names the cook from the known list with no extra read', async () => {
    photos = [{ id: 'c1', url: J }];
    const known = [{ id: 'c1', displayName: ' Sam ' }] as Cook[];
    expect(await getRecipePhoto('r1', known)).toEqual({ cookId: 'c1', url: J, name: 'Sam' });
    expect(getDoc).not.toHaveBeenCalled();
    expect(queries.length).toBe(1);
  });

  it('skips a photo whose cook is gone and uses the next one (one cook read each)', async () => {
    photos = [{ id: 'gone', url: J }, { id: 'c2', url: J }];
    cooksThatExist = { c2: null };
    expect(await getRecipePhoto('r1')).toEqual({ cookId: 'c2', url: J, name: 'A cook' });
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(queries.length).toBe(2);
    expect(queries[1]).toContainEqual(['startAfter', 'gone']);
  });

  it('ignores a photo that is not a JPEG data URL', async () => {
    photos = [{ id: 'c1', url: 'https://x.test/a.jpg' }];
    cooksThatExist = { c1: 'Sam' };
    expect(await getRecipePhoto('r1')).toBeNull();
  });

  it('reads at most 3 photo docs', async () => {
    photos = ['a', 'b', 'c', 'd'].map((id) => ({ id, url: J }));
    expect(await getRecipePhoto('r1')).toBeNull();
    expect(queries.length).toBe(3);
  });

  it('is null when every cook is gone', async () => {
    photos = [{ id: 'a', url: J }];
    expect(await getRecipePhoto('r1')).toBeNull();
  });
});
