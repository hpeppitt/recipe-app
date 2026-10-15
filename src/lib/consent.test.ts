import { describe, expect, it } from 'vitest';
import {
  CONSENT_VERSION,
  expiryCookieStrings,
  gaCookieNames,
  isGranted,
  parseConsent,
  serialiseConsent,
  shouldShowBanner,
} from './consent';

const raw = (o: unknown) => JSON.stringify(o);

describe('parseConsent', () => {
  it('round-trips a valid choice', () => {
    expect(parseConsent(serialiseConsent(true, 5))).toEqual({ analytics: 'granted', at: 5, version: CONSENT_VERSION });
    expect(parseConsent(serialiseConsent(false, 5))?.analytics).toBe('denied');
  });
  it.each([
    ['null', null],
    ['empty', ''],
    ['malformed JSON', '{nope'],
    ['JSON null', 'null'],
    ['wrong types', raw({ analytics: true, at: '1', version: CONSENT_VERSION })],
    ['unknown value', raw({ analytics: 'maybe', at: 1, version: CONSENT_VERSION })],
    ['missing at', raw({ analytics: 'granted', version: CONSENT_VERSION })],
    ['missing version', raw({ analytics: 'granted', at: 1 })],
    ['old version', raw({ analytics: 'granted', at: 1, version: CONSENT_VERSION - 1 })],
    ['future version', raw({ analytics: 'granted', at: 1, version: CONSENT_VERSION + 1 })],
  ])('treats %s as not chosen', (_n, v) => {
    expect(parseConsent(v)).toBeNull();
  });
});

describe('banner and grant', () => {
  const chosen = parseConsent(serialiseConsent(false, 1));
  it('shows only when PostHog is configured and nothing valid is stored', () => {
    expect(shouldShowBanner(true, null)).toBe(true);
    expect(shouldShowBanner(false, null)).toBe(false);
    expect(shouldShowBanner(true, chosen)).toBe(false);
  });
  it('is granted only for granted', () => {
    expect(isGranted(null)).toBe(false);
    expect(isGranted(chosen)).toBe(false);
    expect(isGranted(parseConsent(serialiseConsent(true, 1))!)).toBe(true);
  });
});

describe('GA cookie cleanup helpers', () => {
  it('lists only _ga and _ga_* names', () => {
    expect(gaCookieNames('a=1; _ga=GA1; _ga_ABC123=x; _gat=1; my_ga=2')).toEqual(['_ga', '_ga_ABC123']);
    expect(gaCookieNames('')).toEqual([]);
  });
  it('expires for host and parent domains', () => {
    const s = expiryCookieStrings('_ga', 'www.recipe.example.com');
    expect(s.every((c) => c.includes('path=/') && c.startsWith('_ga=;'))).toBe(true);
    expect(s.filter((c) => c.includes('domain=')).map((c) => c.split('domain=')[1])).toEqual([
      'www.recipe.example.com',
      '.www.recipe.example.com',
      '.recipe.example.com',
      '.example.com',
    ]);
  });
  it('uses no domain for localhost and IPs', () => {
    expect(expiryCookieStrings('_ga', 'localhost')).toHaveLength(1);
    expect(expiryCookieStrings('_ga', '127.0.0.1')).toHaveLength(1);
  });
});
