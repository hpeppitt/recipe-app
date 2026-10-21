import { describe, expect, it } from 'vitest';
import { makeRecipe } from '../test/factories';
import { planOwnRecipeSync, toLocalRecipe, type CloudRecipeDoc } from './recipeSync';
import type { Recipe } from '../types/recipe';

const ME = 'me';
const own = (o: Partial<Recipe> = {}) =>
  makeRecipe({ createdBy: { uid: ME, displayName: 'Me' }, ...o });
const asDoc = (r: Recipe): CloudRecipeDoc => {
  const { chatHistory: _c, ...rest } = r;
  void _c;
  return { ...rest, favoriteCount: 3, viewCount: 9 } as CloudRecipeDoc;
};

describe('toLocalRecipe', () => {
  it('drops counters and unknown keys and applies defaults', () => {
    const doc = {
      ...asDoc(own({ id: 'a' })),
      mystery: 1,
      parentId: undefined,
      rootId: undefined,
      depth: undefined,
      collaborators: undefined,
      prompt: undefined,
      notes: undefined,
    } as unknown as CloudRecipeDoc;
    const r = toLocalRecipe(doc);
    expect(r).not.toHaveProperty('favoriteCount');
    expect(r).not.toHaveProperty('viewCount');
    expect(r).not.toHaveProperty('mystery');
    expect(r).toMatchObject({
      parentId: null,
      rootId: 'a',
      depth: 0,
      collaborators: [],
      prompt: '',
      notes: [],
      chatHistory: [],
    });
  });

  it('takes chatHistory from the local row', () => {
    const row = own({ chatHistory: [{ role: 'user', content: 'hi', timestamp: 1 }] });
    expect(toLocalRecipe(asDoc(row), row).chatHistory).toEqual(row.chatHistory);
  });

  it('carries relatedFamilyId, and leaves it off when the doc has none (RL-162)', () => {
    expect(toLocalRecipe(asDoc(own({ id: 'a', relatedFamilyId: 'fam' }))).relatedFamilyId).toBe('fam');
    expect(toLocalRecipe(asDoc(own({ id: 'b' })))).not.toHaveProperty('relatedFamilyId');
  });

  it('carries importedFrom and importedVia, and leaves them off when absent (RL-186)', () => {
    const via = { uid: ME, displayName: 'Me' };
    const local = toLocalRecipe(asDoc(own({ id: 'a', importedFrom: 'https://a.com/x', importedVia: via })));
    expect(local.importedFrom).toBe('https://a.com/x');
    expect(local.importedVia).toEqual(via);
    const plain = toLocalRecipe(asDoc(own({ id: 'b' })));
    expect(plain).not.toHaveProperty('importedFrom');
    expect(plain).not.toHaveProperty('importedVia');
    const bad = toLocalRecipe(asDoc(own({ id: 'c', importedFrom: 'javascript:alert(1)' })));
    expect(bad).not.toHaveProperty('importedFrom');
  });

  it('a synced doc with relatedFamilyId equal to the row plans no put', () => {
    const r = own({ id: 'a', relatedFamilyId: 'fam' });
    expect(planOwnRecipeSync(ME, [r], [asDoc(r)], []).put).toEqual([]);
  });
});

describe('planOwnRecipeSync', () => {
  it('puts a new cloud doc', () => {
    const r = own({ id: 'a' });
    const plan = planOwnRecipeSync(ME, [], [asDoc(r)], []);
    expect(plan.put).toEqual([r]);
    expect(plan.remove).toEqual([]);
  });

  it('writes nothing for an unchanged snapshot', () => {
    const r = own({ id: 'a' });
    expect(planOwnRecipeSync(ME, [r], [asDoc(r)], [])).toEqual({ put: [], remove: [] });
  });

  it('overwrites a changed title and keeps local chatHistory', () => {
    const row = own({ id: 'a', chatHistory: [{ role: 'user', content: 'x', timestamp: 1 }] });
    const plan = planOwnRecipeSync(ME, [row], [{ ...asDoc(row), title: 'New' }], []);
    expect(plan.put).toHaveLength(1);
    expect(plan.put[0].title).toBe('New');
    expect(plan.put[0].chatHistory).toEqual(row.chatHistory);
  });

  it('ignores cloud docs by another author', () => {
    const other = makeRecipe({ id: 'z', createdBy: { uid: 'them', displayName: null } });
    expect(planOwnRecipeSync(ME, [], [asDoc(other)], [])).toEqual({ put: [], remove: [] });
  });

  it('skips malformed docs without touching the local row', () => {
    const row = own({ id: 'a' });
    const bad = [
      { ...asDoc(row), title: 5 },
      { ...asDoc(row), ingredients: 'x' },
      { ...asDoc(row), instructions: null },
    ];
    expect(planOwnRecipeSync(ME, [row], bad, [])).toEqual({ put: [], remove: [] });
    expect(planOwnRecipeSync(ME, [], [{ title: 'no id' }, null], [])).toEqual({
      put: [],
      remove: [],
    });
  });

  it('an empty snapshot removes every own row and no saved copy', () => {
    const a = own({ id: 'a' });
    const b = own({ id: 'b' });
    const saved = makeRecipe({ id: 's', createdBy: { uid: 'author', displayName: null } });
    const plan = planOwnRecipeSync(ME, [a, b, saved], [], []);
    expect(plan.remove.sort()).toEqual(['a', 'b']);
    expect(plan.put).toEqual([]);
  });

  it('removes a previous account row and keeps local and other rows', () => {
    const prev = makeRecipe({ id: 'p', createdBy: { uid: 'old', displayName: null } });
    const local = makeRecipe({ id: 'l' });
    const saved = makeRecipe({ id: 's', createdBy: { uid: 'author', displayName: null } });
    const plan = planOwnRecipeSync(ME, [prev, local, saved], [], ['old', ME]);
    expect(plan).toEqual({ put: [], remove: ['p'] });
  });

  it('is idempotent on its own output', () => {
    const a = own({ id: 'a' });
    const gone = own({ id: 'gone' });
    const prev = makeRecipe({ id: 'p', createdBy: { uid: 'old', displayName: null } });
    const docs = [asDoc({ ...a, title: 'Changed' }), asDoc(own({ id: 'n' }))];
    const first = planOwnRecipeSync(ME, [a, gone, prev], docs, ['old']);
    const removed = new Set(first.remove);
    const after = [a, gone, prev].filter((r) => !removed.has(r.id));
    const byId = new Map(after.map((r) => [r.id, r]));
    first.put.forEach((r) => byId.set(r.id, r));
    expect(planOwnRecipeSync(ME, [...byId.values()], docs, ['old'])).toEqual({
      put: [],
      remove: [],
    });
  });
});
