import { describe, expect, it } from 'vitest';
import { linkReturnPath, parsePendingAction, PENDING_ACTION_TTL_MS } from './pendingAction';

const NOW = 10_000_000;

describe('parsePendingAction', () => {
  it.each(['save', 'branch', 'suggest'] as const)('accepts a %s on a recipe', (kind) => {
    expect(parsePendingAction({ kind, recipeId: 'r1', at: NOW - 1 }, NOW)).toEqual({ kind, recipeId: 'r1', at: NOW - 1 });
  });

  it('accepts a follow on a uid and drops extra fields', () => {
    expect(parsePendingAction({ kind: 'follow', uid: 'u1', at: NOW, extra: 1 }, NOW)).toEqual({
      kind: 'follow',
      uid: 'u1',
      at: NOW,
    });
  });

  it('keeps the uid that claimed it and drops an empty or non-string one', () => {
    expect(parsePendingAction({ kind: 'save', recipeId: 'r1', at: NOW, by: 'u9' }, NOW)).toEqual({
      kind: 'save',
      recipeId: 'r1',
      at: NOW,
      by: 'u9',
    });
    expect(parsePendingAction({ kind: 'follow', uid: 'u1', at: NOW, by: '' }, NOW)).toEqual({ kind: 'follow', uid: 'u1', at: NOW });
    expect(parsePendingAction({ kind: 'follow', uid: 'u1', at: NOW, by: 7 }, NOW)).toEqual({ kind: 'follow', uid: 'u1', at: NOW });
  });

  it.each([
    ['null', null],
    ['a string', 'save'],
    ['an array', ['save']],
    ['an unknown kind', { kind: 'delete', recipeId: 'r1', at: NOW }],
    ['a missing kind', { recipeId: 'r1', at: NOW }],
    ['a numeric recipe id', { kind: 'save', recipeId: 7, at: NOW }],
    ['an empty recipe id', { kind: 'save', recipeId: '', at: NOW }],
    ['a recipe kind with only a uid', { kind: 'branch', uid: 'u1', at: NOW }],
    ['a follow with a recipe id', { kind: 'follow', recipeId: 'r1', at: NOW }],
    ['a non-string uid', { kind: 'follow', uid: null, at: NOW }],
    ['a missing time', { kind: 'save', recipeId: 'r1' }],
    ['a string time', { kind: 'save', recipeId: 'r1', at: String(NOW) }],
    ['a NaN time', { kind: 'save', recipeId: 'r1', at: NaN }],
    ['a future time', { kind: 'save', recipeId: 'r1', at: NOW + 1 }],
  ])('rejects %s', (_name, raw) => {
    expect(parsePendingAction(raw, NOW)).toBeNull();
  });

  it('keeps an intent exactly one hour old and drops one a millisecond older', () => {
    expect(parsePendingAction({ kind: 'suggest', recipeId: 'r1', at: NOW - PENDING_ACTION_TTL_MS }, NOW)).not.toBeNull();
    expect(parsePendingAction({ kind: 'follow', uid: 'u1', at: NOW - PENDING_ACTION_TTL_MS - 1 }, NOW)).toBeNull();
  });
});

describe('linkReturnPath', () => {
  it('keeps the hash on /shared, where a self-contained recipe lives', () => {
    expect(linkReturnPath('/shared', '#r=abc')).toBe('/shared#r=abc');
    expect(linkReturnPath('/shared', '')).toBe('/shared');
  });
  it('drops the hash everywhere else', () => {
    expect(linkReturnPath('/recipe/r1', '#steps')).toBe('/recipe/r1');
    expect(linkReturnPath('/shared/abc', '#x')).toBe('/shared/abc');
  });
});
