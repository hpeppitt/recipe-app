import { describe, it, expect } from 'vitest';
import { canManageRecipe } from './ownership';

const base = {
  isConfigured: true,
  source: 'cloud' as const,
  userUid: 'me',
  createdByUid: 'me',
};

describe('canManageRecipe', () => {
  it('treats every recipe as owned when Firebase is not configured', () => {
    expect(
      canManageRecipe({
        isConfigured: false,
        source: 'cloud',
        userUid: undefined,
        createdByUid: 'someone-else',
      })
    ).toBe(true);
  });

  it('allows managing a recipe present in this device library', () => {
    expect(canManageRecipe({ ...base, source: 'local', createdByUid: 'someone-else' })).toBe(
      true
    );
  });

  it('allows the creator to manage their own published recipe', () => {
    expect(canManageRecipe(base)).toBe(true);
  });

  // The FUN-4 regressions:

  it('denies a signed-out visitor on someone else published recipe', () => {
    expect(canManageRecipe({ ...base, userUid: undefined, createdByUid: 'someone-else' })).toBe(
      false
    );
  });

  it('denies a signed-in user on another user published recipe', () => {
    expect(canManageRecipe({ ...base, userUid: 'me', createdByUid: 'someone-else' })).toBe(false);
  });

  it("does not trust a cloud recipe's 'local' placeholder uid", () => {
    // Pre-auth recipes carry uid 'local'. Honouring that on a cloud-fetched doc
    // would hand every signed-in user a Delete button on it.
    expect(canManageRecipe({ ...base, userUid: 'me', createdByUid: 'local' })).toBe(false);
  });

  it('denies while the recipe is still resolving, so the menu cannot flash in', () => {
    expect(canManageRecipe({ ...base, source: undefined, createdByUid: 'someone-else' })).toBe(
      false
    );
  });

  it('denies when the recipe carries no creator at all', () => {
    expect(canManageRecipe({ ...base, createdByUid: undefined })).toBe(false);
  });

  it('still allows a signed-out user their own local recipes', () => {
    // Signed out but Firebase configured: local recipes are still on this device.
    expect(
      canManageRecipe({
        isConfigured: true,
        source: 'local',
        userUid: undefined,
        createdByUid: 'local',
      })
    ).toBe(true);
  });
});
