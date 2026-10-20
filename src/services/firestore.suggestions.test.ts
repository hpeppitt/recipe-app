import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeIngredient, makeRecipe } from '../test/factories';
import { RateLimitedError, StaleSuggestionError, SuggestionClosedError } from '../lib/errors';
import type { Recipe } from '../types/recipe';
import type { Suggestion, SuggestionEdit } from '../types/social';

/**
 * Mocked at the SDK boundary, like firestore.favorites.test.ts. Pins the RL-148
 * write order (as RL-017): the recipe write first, then the cache, then the
 * suggestion status, then the notification, so a failure never leaves a
 * suggestion marked done with nothing behind it.
 */

// Every write in the order it happened: [kind, path, data].
const log: [string, string, unknown][] = [];
const updateDoc = vi.fn(async (ref: { path: string }, data: unknown) => {
  log.push(['update', ref.path, data]);
});
const reportError = vi.fn();
const onSnapshot = vi.fn((..._args: unknown[]) => () => {});
const cacheRecipe = vi.fn(async (r: Recipe) => {
  log.push(['cache', r.id, r]);
});
// What the cloud holds, by path; absent means the document does not exist.
let docs: Record<string, unknown>;
// Set to make the next limited write (the recipe window) hit its cap.
let limited: RateLimitedError | null = null;
// Set to make the notification window hit its cap.
let limitedNotification = false;
// Set to make the next transaction commit fail.
let commitError: Error | null = null;

vi.mock('./firebase', () => ({
  firestore: { __mock: true },
  auth: { currentUser: { uid: 'owner' } },
  isFirebaseConfigured: true,
}));

vi.mock('./telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('../db/recipes', () => ({ cacheRecipe: (r: Recipe) => cacheRecipe(r) }));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.length ? segments.join('/') : 'notifications/new' }),
  collection: (_db: unknown, name: string) => ({ path: name }),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => ref.path in docs,
    data: () => docs[ref.path],
  })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  setDoc: vi.fn(async () => {}),
  updateDoc: (ref: { path: string }, data: unknown) => updateDoc(ref, data),
  deleteDoc: vi.fn(async () => {}),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: () => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) }),
  // RL-049: limited writes are transactions with a window. The window is absent;
  // the content write is logged when staged.
  serverTimestamp: () => 'SERVER_TS',
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    // Staged like the SDK: writes land only if fn resolves.
    const staged: [string, string, unknown][] = [];
    const result = await fn({
      get: async (ref: { path: string }) => ({ exists: () => ref.path in docs, data: () => docs[ref.path] }),
      set: (ref: { path: string }, data: unknown) => {
        if (limited) throw limited;
        if (limitedNotification && ref.path.startsWith('notifications/')) throw new RateLimitedError('notification');
        if (!ref.path.startsWith('writeWindows/')) staged.push(['set', ref.path, data]);
      },
      update: (ref: { path: string }, data: unknown) => {
        if (!ref.path.startsWith('writeWindows/')) staged.push(['tx-update', ref.path, data]);
      },
    });
    if (commitError) throw commitError;
    log.push(...staged);
    return result;
  },
}));

const { updateSuggestionStatus, subscribeRecipeSuggestions, applySuggestion, keepSuggestionAsBranch } = await import(
  './firestore'
);
const { suggestionBranchId } = await import('../lib/suggestion');
const reviewer = { uid: 'owner', displayName: 'Olive' };
const SAM = { uid: 'suggester', displayName: 'Sam' };

const ingEdit: SuggestionEdit = { kind: 'ingredient', index: 0, name: 'Sugar', from: '150 g', to: '100 g' };
const stepEdit: SuggestionEdit = { kind: 'step', index: 0, from: 'Boil.', to: 'Simmer.' };

let recipe: Recipe;
const suggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  id: 's1',
  recipeId: 'recipe-1',
  recipeOwnerId: 'owner',
  recipeTitle: 'Soup',
  recipeEmoji: '🍲',
  message: 'More salt',
  status: 'pending',
  suggestedBy: SAM,
  createdAt: 1,
  ...over,
});

// Notifications are fire-and-forget; let them settle before reading the log.
const settle = () => new Promise((r) => setTimeout(r, 0));
const kinds = () => log.map(([k, p]) => `${k} ${p}`);
const notifications = () => log.filter(([, p]) => p === 'notifications/new').map(([, , d]) => d);

beforeEach(() => {
  log.length = 0;
  limited = null;
  limitedNotification = false;
  commitError = null;
  updateDoc.mockClear();
  cacheRecipe.mockClear();
  reportError.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  recipe = makeRecipe({
    id: 'recipe-1',
    title: 'Soup',
    createdBy: reviewer,
    ingredients: [{ ...makeIngredient('Sugar'), amount: 150, unit: 'g' }],
    instructions: [{ step: 1, text: 'Boil.' }] as Recipe['instructions'],
  });
  docs = { 'suggestions/s1': suggestion(), 'recipes/recipe-1': recipe };
});

describe('updateSuggestionStatus (decline)', () => {
  it('writes the status, then notifies the suggester', async () => {
    await updateSuggestionStatus('s1', 'rejected', reviewer);
    await settle();
    expect(kinds()).toEqual(['update suggestions/s1', 'set notifications/new']);
    expect(notifications()[0]).toMatchObject({ type: 'suggestion_rejected', recipientUid: 'suggester', message: 'More salt' });
  });

  it('throws, writing nothing, when the suggestion is gone', async () => {
    delete docs['suggestions/s1'];
    await expect(updateSuggestionStatus('s1', 'rejected', reviewer)).rejects.toThrow();
    expect(log).toEqual([]);
  });
});

describe('applySuggestion (RL-148)', () => {
  it('writes the recipe and the status in one transaction, then caches, then notifies', async () => {
    await applySuggestion(suggestion({ edits: [ingEdit, stepEdit] }), recipe, reviewer);
    await settle();
    expect(kinds()).toEqual([
      'tx-update recipes/recipe-1',
      'tx-update suggestions/s1',
      'cache recipe-1',
      'set notifications/new',
    ]);
    const written = log[0][2] as Recipe;
    expect(written.ingredients[0]).toMatchObject({ amount: 100, unit: 'g' });
    expect(written.instructions[0].text).toBe('Simmer.');
    expect(written.collaborators).toEqual([SAM]);
    expect(log[1][2]).toEqual({ status: 'applied' });
    expect((log[2][2] as Recipe).collaborators).toEqual([SAM]);
    expect(notifications()[0]).toMatchObject({
      type: 'suggestion_applied',
      recipientUid: 'suggester',
      recipeId: 'recipe-1',
      message: '150 g Sugar → 100 g and 1 more',
    });
  });

  it('caches only Recipe fields from the cloud copy, keeping the local chat', async () => {
    docs['recipes/recipe-1'] = { ...recipe, chatHistory: undefined, favoriteCount: 3, viewCount: 9 };
    const local = { ...recipe, chatHistory: [{ role: 'user', content: 'hi', timestamp: 1 }] } as Recipe;
    await applySuggestion(suggestion({ edits: [ingEdit] }), local, reviewer);
    const cached = log.find(([k]) => k === 'cache')![2] as Recipe & Record<string, unknown>;
    expect(cached.chatHistory).toEqual(local.chatHistory);
    expect(cached).not.toHaveProperty('favoriteCount');
    expect(cached).not.toHaveProperty('viewCount');
  });

  it('does not add the suggester twice', async () => {
    docs['recipes/recipe-1'] = { ...recipe, collaborators: [{ uid: 'suggester', displayName: 'Old name' }] };
    await applySuggestion(suggestion({ edits: [ingEdit] }), recipe, reviewer);
    expect((log[0][2] as Recipe).collaborators).toEqual([{ uid: 'suggester', displayName: 'Old name' }]);
  });

  it('writes nothing when an edit is stale against the cloud copy', async () => {
    docs['recipes/recipe-1'] = { ...recipe, ingredients: [{ ...makeIngredient('Sugar'), amount: 200, unit: 'g' }] };
    await expect(applySuggestion(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toBeInstanceOf(
      StaleSuggestionError
    );
    await settle();
    expect(log).toEqual([]);
  });

  it('writes nothing when the suggestion is no longer pending', async () => {
    docs['suggestions/s1'] = suggestion({ status: 'applied' });
    await expect(applySuggestion(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toBeInstanceOf(SuggestionClosedError);
    await settle();
    expect(log).toEqual([]);
  });

  it('leaves both the recipe and the status alone when the commit fails', async () => {
    commitError = new Error('permission-denied');
    await expect(applySuggestion(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toThrow('permission-denied');
    await settle();
    expect(log).toEqual([]);
  });

  it('writes nothing when the recipe is gone from the cloud', async () => {
    delete docs['recipes/recipe-1'];
    await expect(applySuggestion(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toThrow();
    expect(log).toEqual([]);
  });

  it('a failed cache or notification does not fail the apply', async () => {
    cacheRecipe.mockRejectedValueOnce(new Error('quota'));
    limitedNotification = true;
    await applySuggestion(suggestion({ edits: [ingEdit] }), recipe, reviewer);
    await settle();
    expect(kinds()).toEqual(['tx-update recipes/recipe-1', 'tx-update suggestions/s1']);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'apply-suggestion-cache');
  });

  it.each([
    ['free text', undefined],
    ['general only', [{ kind: 'general', from: '', to: 'Serve warm' } as SuggestionEdit]],
  ])('Mark applied (%s) writes only the status and notifies', async (_label, edits) => {
    await applySuggestion(suggestion({ edits }), recipe, reviewer);
    await settle();
    expect(kinds()).toEqual(['update suggestions/s1', 'set notifications/new']);
    expect(notifications()[0]).toMatchObject({ type: 'suggestion_applied', message: edits ? 'Serve warm' : 'More salt' });
  });
});

describe('keepSuggestionAsBranch (RL-148)', () => {
  it('publishes the branch, caches it, then writes branched with its id, then notifies', async () => {
    const branchId = await keepSuggestionAsBranch(suggestion({ edits: [ingEdit] }), recipe, reviewer);
    await settle();
    expect(branchId).toBe(await suggestionBranchId('s1'));
    expect(kinds()).toEqual([
      `set recipes/${branchId}`,
      `cache ${branchId}`,
      'update suggestions/s1',
      'set notifications/new',
    ]);
    expect(log[0][2]).toMatchObject({
      parentId: 'recipe-1',
      createdBy: reviewer,
      collaborators: [SAM],
      favoriteCount: 0,
    });
    expect(log[2][2]).toEqual({ status: 'branched', branchId });
    expect(notifications()[0]).toMatchObject({
      type: 'suggestion_branched',
      recipientUid: 'suggester',
      recipeId: branchId,
      recipeTitle: 'Soup',
      message: '150 g Sugar → 100 g',
    });
  });

  it('builds from the cloud parent, not the copy passed in', async () => {
    const localStale = { ...recipe, title: 'Local title', ingredients: [{ ...makeIngredient('Sugar'), amount: 200, unit: 'g' }] };
    const branchId = await keepSuggestionAsBranch(suggestion({ edits: [ingEdit] }), localStale, reviewer);
    expect(log[0]).toEqual([
      'set',
      `recipes/${branchId}`,
      expect.objectContaining({ title: 'Soup', ingredients: [expect.objectContaining({ amount: 100, unit: 'g' })] }),
    ]);
  });

  it('a retry after a partial failure reuses the published branch instead of making a second one', async () => {
    const edits = [ingEdit];
    const branchId = await suggestionBranchId('s1');
    updateDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(keepSuggestionAsBranch(suggestion({ edits }), recipe, reviewer)).rejects.toThrow('offline');
    // The first attempt's branch is now in the cloud; the status is still pending.
    docs[`recipes/${branchId}`] = log[0][2];
    log.length = 0;

    await expect(keepSuggestionAsBranch(suggestion({ edits }), recipe, reviewer)).resolves.toBe(branchId);
    await settle();
    expect(kinds()).toEqual([`cache ${branchId}`, 'update suggestions/s1', 'set notifications/new']);
  });

  it('writes nothing when the suggestion is no longer pending', async () => {
    docs['suggestions/s1'] = suggestion({ status: 'branched' });
    await expect(keepSuggestionAsBranch(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toBeInstanceOf(SuggestionClosedError);
    expect(log).toEqual([]);
  });

  it.each([
    ['another user', { createdBy: SAM, parentId: 'recipe-1' }],
    ['another recipe', { createdBy: reviewer, parentId: 'other' }],
  ])('refuses an id already taken by %s, writing nothing', async (_label, squat) => {
    const branchId = await suggestionBranchId('s1');
    docs[`recipes/${branchId}`] = { ...recipe, id: branchId, ...squat };
    await expect(keepSuggestionAsBranch(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toThrow('taken');
    await settle();
    expect(log).toEqual([]);
    expect(cacheRecipe).not.toHaveBeenCalled();
  });

  it('writes nothing when the parent is gone from the cloud', async () => {
    delete docs['recipes/recipe-1'];
    await expect(keepSuggestionAsBranch(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toThrow();
    expect(log).toEqual([]);
  });

  it('a rate-limited publish writes nothing else', async () => {
    limited = new RateLimitedError('recipe');
    await expect(keepSuggestionAsBranch(suggestion({ edits: [ingEdit] }), recipe, reviewer)).rejects.toBeInstanceOf(
      RateLimitedError
    );
    await settle();
    expect(log).toEqual([]);
    expect(cacheRecipe).not.toHaveBeenCalled();
  });

  it('writes nothing for stale edits or a suggestion with nothing to apply', async () => {
    const stale = { ...ingEdit, from: '200 g' };
    await expect(keepSuggestionAsBranch(suggestion({ edits: [stale] }), recipe, reviewer)).rejects.toBeInstanceOf(
      StaleSuggestionError
    );
    await expect(keepSuggestionAsBranch(suggestion(), recipe, reviewer)).rejects.toThrow();
    expect(log).toEqual([]);
  });
});

describe('subscribeRecipeSuggestions', () => {
  // The read rule is two-party and a list is authorised from its filters, so
  // each query must filter on the field the rule checks against the viewer.
  const queryOf = () => onSnapshot.mock.calls.at(-1)?.[0];

  it('owner query filters on recipeOwnerId', () => {
    subscribeRecipeSuggestions('recipe-1', 'owner', true, () => {});
    expect(queryOf()).toEqual([
      { path: 'suggestions' },
      ['recipeId', '==', 'recipe-1'],
      ['recipeOwnerId', '==', 'owner'],
      ['createdAt', 'desc'],
    ]);
  });

  it('anyone else filters on suggestedBy.uid', () => {
    subscribeRecipeSuggestions('recipe-1', 'suggester', false, () => {});
    expect(queryOf()).toEqual([
      { path: 'suggestions' },
      ['recipeId', '==', 'recipe-1'],
      ['suggestedBy.uid', '==', 'suggester'],
      ['createdAt', 'desc'],
    ]);
  });
});
