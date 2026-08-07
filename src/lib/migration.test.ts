import { describe, it, expect } from 'vitest';
import { shouldNotify, describeStrandedIdentity, type StrandedIdentity } from './migration';

const SUPPORT = 'support@example.com';

function makeStranded(overrides: Partial<StrandedIdentity> = {}): StrandedIdentity {
  return {
    oldUid: 'anon-uid-123',
    oldDisplayName: 'CrispyWaffle',
    recipeCount: 3,
    at: 1_700_000_000_000,
    ...overrides,
  };
}

describe('shouldNotify', () => {
  it('notifies when the cloud migration failed and recipes were left behind', () => {
    expect(shouldNotify({ ok: false, strandedRecipes: 3 })).toBe(true);
  });

  it('stays quiet on success', () => {
    expect(shouldNotify({ ok: true, strandedRecipes: 0 })).toBe(false);
  });

  // The common case for a new user: they signed up, poked around, published
  // nothing, then added their email. Nothing was lost, so a warning would be
  // pure alarm.
  it('stays quiet when the migration failed but nothing was published', () => {
    expect(shouldNotify({ ok: false, strandedRecipes: 0 })).toBe(false);
  });
});

describe('describeStrandedIdentity', () => {
  it('names the count and the old identity in the title', () => {
    const notice = describeStrandedIdentity(makeStranded(), SUPPORT);
    expect(notice.title).toBe('3 recipes stayed under CrispyWaffle');
  });

  it('uses the singular for one recipe', () => {
    const notice = describeStrandedIdentity(makeStranded({ recipeCount: 1 }), SUPPORT);
    expect(notice.title).toBe('1 recipe stayed under CrispyWaffle');
  });

  // An anonymous account always has a derived name, but the field is nullable
  // and a null must not reach the screen as the word "null".
  it('falls back to a neutral phrase when the old name is unknown', () => {
    const notice = describeStrandedIdentity(
      makeStranded({ oldDisplayName: null }),
      SUPPORT
    );
    expect(notice.title).toBe('3 recipes stayed under your previous account');
    expect(notice.title).not.toContain('null');
  });

  it('says the recipes still exist rather than that they were lost', () => {
    const notice = describeStrandedIdentity(makeStranded(), SUPPORT);
    expect(notice.body).toContain('still published');
    expect(notice.body.toLowerCase()).not.toContain('lost');
    expect(notice.body.toLowerCase()).not.toContain('deleted');
  });

  it('builds a mailto carrying the old uid, so support can act without a reply round-trip', () => {
    const notice = describeStrandedIdentity(makeStranded(), SUPPORT);
    expect(notice.contactHref.startsWith(`mailto:${SUPPORT}?`)).toBe(true);

    const params = new URLSearchParams(notice.contactHref.split('?')[1]);
    expect(params.get('subject')).toBe('Move 3 recipes to my account');
    expect(params.get('body')).toContain('anon-uid-123');
    expect(params.get('body')).toContain('CrispyWaffle');
  });

  it('escapes the mail body rather than breaking the URL on a newline', () => {
    const notice = describeStrandedIdentity(makeStranded(), SUPPORT);
    // Raw newlines in a mailto are what truncate it in some clients.
    expect(notice.contactHref).not.toContain('\n');
    expect(notice.contactHref).toContain('%0A');
  });
});
