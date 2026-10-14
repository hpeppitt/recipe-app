import { describe, it, expect } from 'vitest';
import { canGenerate } from './generation';

describe('canGenerate', () => {
  it('refuses a signed-out visitor', () => {
    expect(canGenerate({ isConfigured: true, user: null })).toBe(false);
  });

  it('refuses an anonymous account', () => {
    expect(canGenerate({ isConfigured: true, user: { emailVerified: false } })).toBe(false);
  });

  it('refuses an email account whose address is not verified', () => {
    const unverified = { uid: 'u', displayName: 'A', email: 'a@b.c', isAnonymous: false, emailVerified: false };
    expect(canGenerate({ isConfigured: true, user: unverified })).toBe(false);
  });

  it('allows a verified email account', () => {
    expect(canGenerate({ isConfigured: true, user: { emailVerified: true } })).toBe(true);
  });

  it('shows no gate in local-only mode, signed in or not', () => {
    expect(canGenerate({ isConfigured: false, user: null })).toBe(true);
    expect(canGenerate({ isConfigured: false, user: { emailVerified: false } })).toBe(true);
  });
});
