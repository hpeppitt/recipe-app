// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { makeIngredient, makeRecipe } from '../test/factories';
import {
  ALREADY_IN_KITCHEN_MESSAGE,
  INVITE_EXPIRED_MESSAGE,
  KitchenFullError,
  KITCHEN_MEMBERS_FULL_MESSAGE,
  KITCHEN_SHARING_BUSY_MESSAGE,
  KITCHEN_SHARING_FAILED_MESSAGE,
  NOT_OWNER_MESSAGE,
  OWNER_CANNOT_LEAVE_MESSAGE,
  OWNER_HAS_MEMBERS_MESSAGE,
  type KitchenLists,
} from '../lib/kitchen';
import type { AppUser } from '../types/recipe';

const subscribeKitchen = vi.fn();
const updateKitchen = vi.fn();
const unsubscribe = vi.fn();
const findKitchenId = vi.fn();
const getKitchenMembers = vi.fn();
const getKitchenOnce = vi.fn();
const getKitchenInvite = vi.fn();
const joinKitchenWithInvite = vi.fn();
const leaveKitchen = vi.fn();
const removeKitchenMember = vi.fn();
const createKitchenInvite = vi.fn();
const deleteKitchenInvites = vi.fn();
vi.mock('../services/firestore', () => {
  class KitchenJoinDeniedError extends Error {}
  return {
    KitchenJoinDeniedError,
    deleteKitchenInvites: (...a: unknown[]) => deleteKitchenInvites(...a),
    subscribeKitchen: (...a: unknown[]) => subscribeKitchen(...a),
    updateKitchen: (...a: unknown[]) => updateKitchen(...a),
    findKitchenId: (...a: unknown[]) => findKitchenId(...a),
    getKitchenMembers: (...a: unknown[]) => getKitchenMembers(...a),
    getKitchenOnce: (...a: unknown[]) => getKitchenOnce(...a),
    getKitchenInvite: (...a: unknown[]) => getKitchenInvite(...a),
    joinKitchenWithInvite: (...a: unknown[]) => joinKitchenWithInvite(...a),
    leaveKitchen: (...a: unknown[]) => leaveKitchen(...a),
    removeKitchenMember: (...a: unknown[]) => removeKitchenMember(...a),
    createKitchenInvite: (...a: unknown[]) => createKitchenInvite(...a),
  };
});
const getIdToken = vi.fn(async () => 'token');
vi.mock('../services/firebase', () => ({ auth: { currentUser: { getIdToken: (...a: unknown[]) => getIdToken(...(a as [])) } } }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { KitchenJoinDeniedError } from '../services/firestore';
import { __resetKitchenSessionForTests, KITCHEN_BUSY_MESSAGE, KITCHEN_FAILED_MESSAGE, KITCHEN_FULL_MESSAGE, KITCHEN_MAYBE_SAVED_MESSAGE, KITCHEN_RETRY_MS, useKitchen, addRecipeToKitchen, addLeftoversToPantry } from './useKitchen';

const wrapperFor = (user: AppUser | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={{ user, isLoading: false, isConfigured: true } as AuthContextType}>
        {children}
      </AuthContext.Provider>
    );
  };

/** Lets the kitchen id resolve and the listener open. */
const settle = () => act(async () => {});

let lists: KitchenLists = { shopping: [], pantry: [] };
beforeEach(() => {
  vi.clearAllMocks();
  __resetKitchenSessionForTests();
  lists = { shopping: [], pantry: [] };
  subscribeKitchen.mockImplementation((_id: string, next: (k: unknown) => void) => {
    next(null);
    return unsubscribe;
  });
  findKitchenId.mockImplementation(async (uid: string) => uid);
  getKitchenMembers.mockImplementation(async (uids: string[]) => uids.map((uid) => ({ uid, name: `name-${uid}`, avatar: null })));
  // Applies the mutation to `lists`, as the transaction would to the stored document.
  updateKitchen.mockImplementation(async (_id: string, fn: (k: KitchenLists) => KitchenLists) => {
    lists = fn(lists);
  });
});
afterEach(() => vi.spyOn(navigator, 'onLine', 'get').mockRestore());

describe('useKitchen', () => {
  it('opens one listener on kitchens/{uid} however many components call it, and closes it after the last', async () => {
    const wrapper = wrapperFor(fakeUser);
    const a = renderHook(() => useKitchen(), { wrapper });
    const b = renderHook(() => useKitchen(), { wrapper });
    await settle();
    expect(findKitchenId).toHaveBeenCalledTimes(1);
    expect(subscribeKitchen).toHaveBeenCalledTimes(1);
    expect(subscribeKitchen).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function), expect.any(Function));
    expect(b.result.current.kitchen).toEqual({ memberUids: [fakeUser.uid], ownerUid: fakeUser.uid, shopping: [], pantry: [], updatedAt: null });
    expect(b.result.current.loading).toBe(false);
    a.unmount();
    expect(unsubscribe).not.toHaveBeenCalled();
    b.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['signed out', null],
    ['unverified', { ...fakeUser, emailVerified: false }],
    ['anonymous', { ...fakeUser, isAnonymous: true }],
  ])('returns kitchen null without reading when %s', async (_label, user) => {
    const { result } = renderHook(() => useKitchen(), { wrapper: wrapperFor(user) });
    await settle();
    expect(findKitchenId).not.toHaveBeenCalled();
    expect(subscribeKitchen).not.toHaveBeenCalled();
    expect(result.current.kitchen).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('runs each mutation through updateKitchen with the RL-212 helpers', async () => {
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    const recipe = makeRecipe({ id: 'r1', servings: 2, ingredients: [makeIngredient('onion'), makeIngredient('rice')] });
    await act(() => result.current.addRecipe(recipe, 4));
    expect(updateKitchen).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function));
    expect(lists.shopping.length).toBeGreaterThan(0);
    const first = lists.shopping[0];

    await act(() => result.current.toggleLine(first.id, true));
    await act(() => result.current.toggleLine(first.id, true));
    expect(lists.shopping[0].done).toBe(true);

    await act(() => result.current.addPantry('  Salt  '));
    await act(() => result.current.addPantry('salt'));
    expect(lists.pantry.map((p) => [p.name, p.group, p.addedBy])).toEqual([['Salt', 'cupboard', fakeUser.uid]]);
    await act(() => result.current.removePantry(lists.pantry[0].id));
    expect(lists.pantry).toEqual([]);

    await act(() => result.current.boughtItAll());
    expect(lists.shopping).toEqual([]);
    expect(lists.pantry.length).toBeGreaterThan(0);

    await act(() => result.current.addRecipe(recipe, 2));
    await act(() => result.current.removeSource('r1'));
    expect(lists.shopping).toEqual([]);
    unmount();
  });

  it('adds several pantry items in one write, skipping duplicates', async () => {
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => result.current.addPantryItems(['Milk', 'milk', ' Rice ', '']));
    expect(updateKitchen).toHaveBeenCalledTimes(1);
    expect(lists.pantry.map((p) => [p.name, p.group, p.addedBy])).toEqual([['Milk', 'fresh', fakeUser.uid], ['Rice', 'cupboard', fakeUser.uid]]);
    unmount();
  });

  it('shows the full copy when a write would pass a cap', async () => {
    updateKitchen.mockRejectedValue(new KitchenFullError());
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_FULL_MESSAGE));
    expect(result.current.error).toBe(KITCHEN_FULL_MESSAGE);
    expect(reportError).not.toHaveBeenCalled();
    unmount();
  });

  it('fails offline without trying to write, and clears the error after a good write', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await settle();
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_FAILED_MESSAGE));
    expect(updateKitchen).not.toHaveBeenCalled();
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    onLine.mockReturnValue(true);
    await act(() => result.current.addPantry('salt'));
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('shows the failed copy and reports a failed write', async () => {
    updateKitchen.mockRejectedValue(new Error('permission-denied'));
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_FAILED_MESSAGE));
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-write');
    unmount();
  });

  it('says it may have saved when the write timed out', async () => {
    updateKitchen.mockRejectedValue(new Error('Updating the kitchen timed out'));
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await act(() => expect(result.current.addPantry('salt')).rejects.toThrow(KITCHEN_MAYBE_SAVED_MESSAGE));
    expect(result.current.error).toBe(KITCHEN_MAYBE_SAVED_MESSAGE);
    unmount();
  });

  it('drops a second call while a write is in flight, so a double addRecipe applies once', async () => {
    let release!: () => void;
    updateKitchen.mockImplementation(async (_id: string, fn: (k: KitchenLists) => KitchenLists) => {
      await new Promise<void>((r) => (release = r));
      lists = fn(lists);
    });
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    const recipe = makeRecipe({ id: 'r1', servings: 2, ingredients: [makeIngredient('onion')] });
    await act(async () => {
      const a = result.current.addRecipe(recipe, 2);
      const b = result.current.addRecipe(recipe, 2);
      await vi.waitFor(() => expect(updateKitchen).toHaveBeenCalled());
      release();
      await Promise.all([a, b]);
    });
    expect(updateKitchen).toHaveBeenCalledTimes(1);
    expect(lists.shopping).toHaveLength(1);
    expect(lists.shopping[0].amount).toBe(1);
    unmount();
  });

  it('shows null on a failed first read, refreshes the token on permission-denied and resubscribes once', async () => {
    vi.useFakeTimers();
    subscribeKitchen
      .mockImplementationOnce((_id: string, _next: unknown, error: (e: unknown) => void) => {
        error(Object.assign(new Error('denied'), { code: 'permission-denied' }));
        return unsubscribe;
      })
      .mockImplementationOnce((_id: string, next: (k: unknown) => void) => {
        next(null);
        return unsubscribe;
      });
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await settle();
    expect(result.current.kitchen).toBeNull();
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-listener');
    await act(() => vi.advanceTimersByTimeAsync(KITCHEN_RETRY_MS));
    await settle();
    expect(getIdToken).toHaveBeenCalledWith(true);
    // Resolved again, so a removed member falls back to their own kitchen.
    expect(findKitchenId).toHaveBeenCalledTimes(2);
    expect(subscribeKitchen).toHaveBeenCalledTimes(2);
    expect(result.current.kitchen?.shopping).toEqual([]);
    expect(result.current.error).toBeNull();
    unmount();
    vi.useRealTimers();
  });

  it('addRecipeToKitchen counts lines not in the pantry and never opens the listener', async () => {
    lists = { shopping: [], pantry: [{ id: 'p1', name: 'rice', group: 'cupboard', addedBy: 'u', addedAt: 0 }] } as unknown as KitchenLists;
    const recipe = makeRecipe({ id: 'r1', ingredients: [makeIngredient('onion'), makeIngredient('rice')] });
    await expect(addRecipeToKitchen(fakeUser.uid, recipe, recipe.servings)).resolves.toBe(1);
    expect(lists.shopping).toHaveLength(2);
    expect(subscribeKitchen).not.toHaveBeenCalled();
  });

  it('addRecipeToKitchen rejects instead of reporting success when another write is running', async () => {
    let release!: () => void;
    updateKitchen.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const { result, unmount } = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggleLine('x', true);
    });
    await expect(addRecipeToKitchen(fakeUser.uid, makeRecipe({ id: 'r2' }), 2)).rejects.toThrow(KITCHEN_BUSY_MESSAGE);
    await vi.waitFor(() => expect(updateKitchen).toHaveBeenCalled());
    await act(async () => {
      release();
      await first;
    });
    unmount();
  });

  it('addLeftoversToPantry adds one fresh item and skips a duplicate by key', async () => {
    await addLeftoversToPantry(fakeUser.uid, 'Dal leftovers');
    await addLeftoversToPantry(fakeUser.uid, 'dal Leftovers');
    expect(lists.pantry).toHaveLength(1);
    expect(lists.pantry[0]).toMatchObject({ name: 'Dal leftovers', group: 'fresh', addedBy: fakeUser.uid });
    expect(subscribeKitchen).not.toHaveBeenCalled();
  });
});

describe('useKitchen household sharing (RL-238)', () => {
  const me = fakeUser.uid;
  const CODE = 'a'.repeat(20);
  const shared = (ownerUid: string, memberUids: string[]) => ({ memberUids, ownerUid, shopping: [], pantry: [], updatedAt: 1 });
  let docs: Record<string, unknown>;
  let emit: Record<string, (k: unknown) => void>;
  const live = { code: CODE, kitchenId: 'owner1', ownerUid: 'owner1', expiresAt: Date.now() + 60_000 };

  beforeEach(() => {
    docs = {};
    emit = {};
    subscribeKitchen.mockImplementation((id: string, next: (k: unknown) => void) => {
      emit[id] = next;
      next(docs[id] ?? null);
      return unsubscribe;
    });
  });

  const mount = async () => {
    const hook = renderHook(() => useKitchen(), { wrapper: wrapperFor(fakeUser) });
    await settle();
    return hook;
  };

  it('resolves the kitchen id before subscribing, writes there, and reads member profiles once per member set', async () => {
    findKitchenId.mockResolvedValue('owner1');
    docs.owner1 = shared('owner1', ['owner1', me]);
    const { result, unmount } = await mount();
    expect(subscribeKitchen).toHaveBeenCalledWith('owner1', expect.any(Function), expect.any(Function));
    expect(result.current.isOwner).toBe(false);
    expect(result.current.members.map((m) => m.uid)).toEqual(['owner1', me]);
    expect(result.current.members[0].name).toBe('name-owner1');

    await act(async () => emit.owner1({ ...shared('owner1', ['owner1', me]), updatedAt: 2 }));
    expect(getKitchenMembers).toHaveBeenCalledTimes(1);
    await act(async () => emit.owner1(shared('owner1', ['owner1', me, 'u3'])));
    expect(getKitchenMembers).toHaveBeenCalledTimes(2);
    expect(result.current.members).toHaveLength(3);

    await act(() => result.current.addPantry('salt'));
    expect(updateKitchen).toHaveBeenLastCalledWith('owner1', expect.any(Function));
    await addRecipeToKitchen(me, makeRecipe({ id: 'r9' }), 2);
    expect(updateKitchen).toHaveBeenLastCalledWith('owner1', expect.any(Function));
    expect(findKitchenId).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('one-shot writers resolve the kitchen id too, without opening the listener', async () => {
    findKitchenId.mockResolvedValue('owner1');
    await addLeftoversToPantry(me, 'Soup');
    expect(updateKitchen).toHaveBeenCalledWith('owner1', expect.any(Function));
    expect(subscribeKitchen).not.toHaveBeenCalled();
  });

  it('re-resolves the kitchen id after a write is denied (removed member)', async () => {
    findKitchenId.mockResolvedValue('owner1');
    updateKitchen.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await expect(addLeftoversToPantry(me, 'Soup')).rejects.toThrow(KITCHEN_FAILED_MESSAGE);
    findKitchenId.mockResolvedValue(me);
    await addLeftoversToPantry(me, 'Soup');
    expect(updateKitchen).toHaveBeenLastCalledWith(me, expect.any(Function));
  });

  it('a lookup timeout is a plain failure, not "may have saved"', async () => {
    findKitchenId.mockRejectedValue(new Error('Finding your kitchen timed out'));
    await expect(addLeftoversToPantry(me, 'Soup')).rejects.toThrow(KITCHEN_FAILED_MESSAGE);
    expect(updateKitchen).not.toHaveBeenCalled();
  });

  it('shows the generic copy when the kitchen id cannot be found', async () => {
    findKitchenId.mockRejectedValue(new Error('offline'));
    const { result, unmount } = await mount();
    expect(result.current.error).toBe(KITCHEN_FAILED_MESSAGE);
    expect(subscribeKitchen).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-resolve');
    unmount();
  });

  describe('createInvite', () => {
    it('returns the /join/<code> URL for the owner', async () => {
      docs[me] = shared(me, [me]);
      createKitchenInvite.mockResolvedValue(CODE);
      const { result, unmount } = await mount();
      expect(result.current.isOwner).toBe(true);
      await expect(result.current.createInvite()).resolves.toBe(`${window.location.origin}/join/${CODE}`);
      expect(createKitchenInvite).toHaveBeenCalledWith(me, fakeUser.displayName ?? '');
      expect(updateKitchen).not.toHaveBeenCalled();
      unmount();
    });

    it('creates the kitchen document first when there is none, since the invite rule reads its owner', async () => {
      createKitchenInvite.mockResolvedValue(CODE);
      const { result, unmount } = await mount();
      await act(() => result.current.createInvite());
      expect(updateKitchen).toHaveBeenCalledWith(me, expect.any(Function));
      expect(updateKitchen.mock.invocationCallOrder[0]).toBeLessThan(createKitchenInvite.mock.invocationCallOrder[0]);
      unmount();
    });

    it('refuses a member who is not the owner', async () => {
      findKitchenId.mockResolvedValue('owner1');
      docs.owner1 = shared('owner1', ['owner1', me]);
      const { result, unmount } = await mount();
      await expect(result.current.createInvite()).rejects.toThrow(NOT_OWNER_MESSAGE);
      expect(createKitchenInvite).not.toHaveBeenCalled();
      unmount();
    });

    it('gives the generic copy and reports a failed write, without setting the hook error', async () => {
      updateKitchen.mockRejectedValue(new Error('permission-denied'));
      const { result, unmount } = await mount();
      await act(() => expect(result.current.createInvite()).rejects.toThrow(KITCHEN_SHARING_FAILED_MESSAGE));
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-invite');
      expect(result.current.error).toBeNull();
      unmount();
    });
  });

  describe('joinKitchen', () => {
    it('joins with a live invite and switches the listener to that kitchen', async () => {
      getKitchenInvite.mockResolvedValue(live);
      docs.owner1 = shared('owner1', ['owner1', me]);
      const { result, unmount } = await mount();
      await act(() => result.current.joinKitchen(CODE));
      expect(joinKitchenWithInvite).toHaveBeenCalledWith(live);
      // The own kitchen's links stop working before the user moves.
      expect(deleteKitchenInvites).toHaveBeenCalledWith(me);
      expect(deleteKitchenInvites.mock.invocationCallOrder[0]).toBeLessThan(joinKitchenWithInvite.mock.invocationCallOrder[0]);
      expect(subscribeKitchen).toHaveBeenLastCalledWith('owner1', expect.any(Function), expect.any(Function));
      expect(result.current.kitchen?.ownerUid).toBe('owner1');
      expect(result.current.isOwner).toBe(false);
      unmount();
    });

    it.each([
      ['a malformed code', 'short', null],
      ['a missing invite', CODE, null],
      ['an expired invite', CODE, { ...live, expiresAt: Date.now() - 1 }],
    ])('says the invite has expired for %s', async (_label, code, invite) => {
      getKitchenInvite.mockResolvedValue(invite);
      const { result, unmount } = await mount();
      await expect(result.current.joinKitchen(code)).rejects.toThrow(INVITE_EXPIRED_MESSAGE);
      expect(joinKitchenWithInvite).not.toHaveBeenCalled();
      unmount();
    });

    it('says the invite has expired when the join is denied and the invite is gone on a re-read', async () => {
      getKitchenInvite.mockResolvedValueOnce(live).mockResolvedValueOnce(null);
      joinKitchenWithInvite.mockRejectedValue(new KitchenJoinDeniedError());
      const { result, unmount } = await mount();
      await expect(result.current.joinKitchen(CODE)).rejects.toThrow(INVITE_EXPIRED_MESSAGE);
      unmount();
    });

    it('says the kitchen is full when a live invite is refused and the user is not a member', async () => {
      getKitchenInvite.mockResolvedValue(live);
      joinKitchenWithInvite.mockRejectedValue(new KitchenJoinDeniedError());
      const { result, unmount } = await mount();
      await expect(result.current.joinKitchen(CODE)).rejects.toThrow(KITCHEN_MEMBERS_FULL_MESSAGE);
      expect(findKitchenId).toHaveBeenCalledTimes(2);
      unmount();
    });

    it('treats a refusal for someone already in memberUids as joined', async () => {
      getKitchenInvite.mockResolvedValue(live);
      joinKitchenWithInvite.mockRejectedValue(new KitchenJoinDeniedError());
      const { result, unmount } = await mount();
      findKitchenId.mockResolvedValue('owner1');
      await act(() => result.current.joinKitchen(CODE));
      expect(subscribeKitchen).toHaveBeenLastCalledWith('owner1', expect.any(Function), expect.any(Function));
      unmount();
    });

    it('runs one membership action at a time', async () => {
      let release!: (v: unknown) => void;
      getKitchenInvite.mockImplementationOnce(() => new Promise((r) => (release = r)));
      const { result, unmount } = await mount();
      let first!: Promise<void>;
      act(() => {
        first = result.current.joinKitchen(CODE);
      });
      await expect(result.current.joinKitchen(CODE)).rejects.toThrow(KITCHEN_SHARING_BUSY_MESSAGE);
      await act(async () => {
        release(null);
        await first.catch(() => {});
      });
      unmount();
    });

    it('does nothing when already in that kitchen', async () => {
      findKitchenId.mockResolvedValue('owner1');
      getKitchenInvite.mockResolvedValue(live);
      const { result, unmount } = await mount();
      await act(() => result.current.joinKitchen(CODE));
      expect(joinKitchenWithInvite).not.toHaveBeenCalled();
      unmount();
    });

    it('refuses while a member of another shared kitchen (one kitchen per person)', async () => {
      findKitchenId.mockResolvedValue('other');
      docs.other = shared('other', ['other', me]);
      getKitchenInvite.mockResolvedValue(live);
      const { result, unmount } = await mount();
      await expect(result.current.joinKitchen(CODE)).rejects.toThrow(ALREADY_IN_KITCHEN_MESSAGE);
      expect(joinKitchenWithInvite).not.toHaveBeenCalled();
      unmount();
    });

    it('refuses an owner whose own kitchen has other members', async () => {
      docs[me] = shared(me, [me, 'u2']);
      getKitchenInvite.mockResolvedValue(live);
      const { result, unmount } = await mount();
      await expect(result.current.joinKitchen(CODE)).rejects.toThrow(OWNER_HAS_MEMBERS_MESSAGE);
      expect(joinKitchenWithInvite).not.toHaveBeenCalled();
      unmount();
    });

    it('gives the generic copy and reports any other failure', async () => {
      getKitchenInvite.mockRejectedValue(new Error('Reading the invite timed out'));
      const { result, unmount } = await mount();
      await expect(result.current.joinKitchen(CODE)).rejects.toThrow(KITCHEN_SHARING_FAILED_MESSAGE);
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'kitchen-join');
      unmount();
    });
  });

  describe('leaveKitchen and removeMember', () => {
    it('a member leaves and goes back to their own kitchen', async () => {
      findKitchenId.mockResolvedValue('owner1');
      docs.owner1 = shared('owner1', ['owner1', me]);
      const { result, unmount } = await mount();
      await act(() => result.current.leaveKitchen());
      expect(leaveKitchen).toHaveBeenCalledWith('owner1');
      expect(subscribeKitchen).toHaveBeenLastCalledWith(me, expect.any(Function), expect.any(Function));
      expect(result.current.isOwner).toBe(true);
      unmount();
    });

    it('the owner cannot leave', async () => {
      docs[me] = shared(me, [me, 'u2']);
      const { result, unmount } = await mount();
      await expect(result.current.leaveKitchen()).rejects.toThrow(OWNER_CANNOT_LEAVE_MESSAGE);
      expect(leaveKitchen).not.toHaveBeenCalled();
      unmount();
    });

    it('the owner removes a member', async () => {
      docs[me] = shared(me, [me, 'u2']);
      const { result, unmount } = await mount();
      await act(() => result.current.removeMember('u2'));
      expect(removeKitchenMember).toHaveBeenCalledWith(me, 'u2');
      unmount();
    });

    it('a member cannot remove anyone, and the owner cannot remove themselves', async () => {
      findKitchenId.mockResolvedValue('owner1');
      docs.owner1 = shared('owner1', ['owner1', me, 'u3']);
      const member = await mount();
      await expect(member.result.current.removeMember('u3')).rejects.toThrow(NOT_OWNER_MESSAGE);
      member.unmount();
      findKitchenId.mockImplementation(async (uid: string) => uid);
      docs[me] = shared(me, [me, 'u2']);
      const owner = await mount();
      await expect(owner.result.current.removeMember(me)).rejects.toThrow(NOT_OWNER_MESSAGE);
      expect(removeKitchenMember).not.toHaveBeenCalled();
      owner.unmount();
    });
  });
});
