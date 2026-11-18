import { describe, it, expect, vi } from 'vitest';
import {
  anonymisePantry,
  deleteAccount,
  DELETION_STEPS,
  needsReauth,
  ownsSharedKitchen,
  runDeletionSteps,
  type DeleteAccountDeps,
  type DeletionDataResult,
  type DeletionStep,
} from './accountDeletion';

describe('DELETION_STEPS', () => {
  it('keeps the order the rules need', () => {
    const at = (s: DeletionStep) => DELETION_STEPS.indexOf(s);
    expect(at('cookPhotos')).toBeLessThan(at('cooks'));
    expect(at('followsAsFollower')).toBeLessThan(at('followsAsFollowed'));
    expect(at('suggestionReplies')).toBeLessThan(at('suggestions'));
    expect(at('notificationsReceived')).toBeLessThan(at('notificationsSent'));
    expect(at('kitchenInvites')).toBeLessThan(at('kitchenPantry'));
    expect(at('kitchenPantry')).toBeLessThan(at('kitchens'));
    expect(at('collections')).toBeLessThan(at('recipes'));
    expect(DELETION_STEPS.slice(-5)).toEqual(['feedback', 'notificationPrefs', 'tasteProfile', 'termsAcceptance', 'profile']);
    expect(new Set(DELETION_STEPS).size).toBe(DELETION_STEPS.length);
  });
});

describe('needsReauth', () => {
  it('asks again when the sign-in is unknown or older than 2 minutes', () => {
    expect(needsReauth(null, 1_000_000)).toBe(true);
    expect(needsReauth(Number.NaN, 1_000_000)).toBe(true);
    expect(needsReauth(1_000_000 - 120_000, 1_000_000)).toBe(false);
    expect(needsReauth(1_000_000 - 120_001, 1_000_000)).toBe(true);
    expect(needsReauth(1_000_000 - 5_000, 1_000_000)).toBe(false);
  });
});

describe('ownsSharedKitchen', () => {
  it('blocks only an owner with other members', () => {
    expect(ownsSharedKitchen('a', [])).toBe(false);
    expect(ownsSharedKitchen('a', [{ ownerUid: 'a', memberUids: ['a'] }])).toBe(false);
    expect(ownsSharedKitchen('a', [{ ownerUid: 'b', memberUids: ['b', 'a'] }])).toBe(false);
    expect(ownsSharedKitchen('a', [{ ownerUid: 'a', memberUids: ['a', 'b'] }])).toBe(true);
    expect(ownsSharedKitchen('a', [{ ownerUid: 'b', memberUids: ['b', 'a'] }, { ownerUid: 'a', memberUids: ['a', 'c'] }])).toBe(true);
  });
});

describe('anonymisePantry', () => {
  const item = (id: string, addedBy: string) => ({ id, name: id, group: 'fresh' as const, addedBy, addedAt: 1 });
  it('credits only the lines the user added to deleted-user, and says when there is nothing to do', () => {
    expect(anonymisePantry([item('x', 'b')], 'a')).toBeNull();
    expect(anonymisePantry([item('x', 'a'), item('y', 'b')], 'a')).toEqual([item('x', 'deleted-user'), item('y', 'b')]);
  });
});

describe('runDeletionSteps', () => {
  it('runs every step in order, one at a time', async () => {
    const seen: string[] = [];
    let running = 0;
    const out = await runDeletionSteps(async (step) => {
      running++;
      expect(running).toBe(1);
      seen.push(step);
      await Promise.resolve();
      running--;
      return { done: 1, failed: 0 };
    });
    expect(seen).toEqual([...DELETION_STEPS]);
    expect(out.failed).toBe(0);
    expect(out.steps.map((s) => s.step)).toEqual([...DELETION_STEPS]);
  });

  it('counts a rejected step as one failure, carries on, and skips the profile', async () => {
    const seen: string[] = [];
    const out = await runDeletionSteps(async (step) => {
      seen.push(step);
      if (step === 'favorites') throw new Error('denied');
      if (step === 'recipes') return { done: 2, failed: 3 };
      return { done: 0, failed: 0 };
    });
    expect(out.failed).toBe(4);
    expect(seen).not.toContain('profile');
    expect(seen).toContain('termsAcceptance');
    expect(out.steps.find((s) => s.step === 'favorites')).toEqual({ step: 'favorites', done: 0, failed: 1 });
    expect(out.steps.find((s) => s.step === 'profile')).toEqual({ step: 'profile', done: 0, failed: 0, skipped: true });
  });
});

describe('deleteAccount', () => {
  const clean: DeletionDataResult = { status: 'ran', steps: [{ step: 'recipes', done: 3, failed: 0 }], failed: 0 };
  const deps = (over: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps => ({
    authTimeMs: async () => 1000,
    now: () => 2000,
    deleteData: vi.fn(async () => clean),
    deleteAuthUser: vi.fn(async () => 'deleted' as const),
    clearLocal: vi.fn(async () => {}),
    resetAnalytics: vi.fn(),
    ...over,
  });

  it('asks for a fresh sign-in before touching anything', async () => {
    const d = deps({ authTimeMs: async () => 0, now: () => 200_000 });
    expect(await deleteAccount(d)).toEqual({ status: 'needs-reauth' });
    expect(d.deleteData).not.toHaveBeenCalled();
    const unknown = deps({ authTimeMs: () => Promise.reject(new Error('offline')) });
    expect(await deleteAccount(unknown)).toEqual({ status: 'needs-reauth' });
  });

  it('stops at the shared-kitchen block', async () => {
    const d = deps({ deleteData: vi.fn(async (): Promise<DeletionDataResult> => ({ status: 'blocked', reason: 'shared-kitchen' })) });
    expect(await deleteAccount(d)).toEqual({ status: 'blocked', reason: 'shared-kitchen' });
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('keeps the Auth user after any failure', async () => {
    const partial: DeletionDataResult = { status: 'ran', steps: [{ step: 'notificationsSent', done: 0, failed: 1 }], failed: 1 };
    const d = deps({ deleteData: vi.fn(async () => partial) });
    expect(await deleteAccount(d)).toMatchObject({ status: 'partial', failed: 1 });
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
    expect(d.clearLocal).not.toHaveBeenCalled();
    const threw = deps({ deleteData: () => Promise.reject(new Error('boom')) });
    expect(await deleteAccount(threw)).toMatchObject({ status: 'partial' });
    expect(threw.deleteAuthUser).not.toHaveBeenCalled();
  });

  it('deletes the Auth user at zero failures, then clears the device and analytics', async () => {
    const d = deps();
    expect(await deleteAccount(d)).toEqual({ status: 'deleted', steps: clean.steps });
    expect(d.deleteAuthUser).toHaveBeenCalledOnce();
    expect(d.clearLocal).toHaveBeenCalledOnce();
    expect(d.resetAnalytics).toHaveBeenCalledOnce();
  });

  it('maps the Auth outcomes and never rejects', async () => {
    expect(await deleteAccount(deps({ deleteAuthUser: async () => 'needs-reauth' }))).toEqual({ status: 'needs-reauth' });
    expect(await deleteAccount(deps({ deleteAuthUser: () => Promise.reject(new Error('x')) }))).toMatchObject({ status: 'auth-failed' });
    const d = deps({ clearLocal: () => Promise.reject(new Error('x')), resetAnalytics: () => { throw new Error('y'); } });
    expect(await deleteAccount(d)).toMatchObject({ status: 'deleted' });
  });
});
