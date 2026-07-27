import { describe, it, expect } from 'vitest';
import { describeGenerationError, GENERATION_UNAVAILABLE } from './errors';

describe('describeGenerationError', () => {
  // The key belongs to Firebase now, so a rejection is an operator problem. Offering
  // a Settings link would dead-end on a page with no key field.
  it('reports a rejected key without pointing at Settings', () => {
    const result = describeGenerationError(
      new Error('[400 Bad Request] API key not valid. Please pass a valid API key.')
    );

    expect(result.action).toBeUndefined();
    expect(result.message).toMatch(/misconfigured/i);
  });

  it('treats a 403 the same way, with no user-facing action', () => {
    expect(describeGenerationError(new Error('403 PERMISSION_DENIED')).action).toBeUndefined();
  });

  it('explains an App Check rejection as something a reload may fix', () => {
    const result = describeGenerationError(new Error('Firebase App Check token is invalid'));

    expect(result.message).toMatch(/verify itself/i);
    expect(result.action).toBeUndefined();
  });

  it('explains rate limiting without offering Settings', () => {
    const result = describeGenerationError(new Error('429 RESOURCE_EXHAUSTED: quota exceeded'));

    expect(result.message).toMatch(/rate-limiting/i);
    expect(result.action).toBeUndefined();
  });

  it('recognises a network failure', () => {
    expect(describeGenerationError(new TypeError('Failed to fetch')).message).toMatch(
      /check your connection/i
    );
  });

  it('recognises unreadable model output', () => {
    expect(
      describeGenerationError(new Error('Unexpected token } in JSON at position 42')).message
    ).toMatch(/could not read/i);
  });

  it('recognises an upstream outage', () => {
    expect(describeGenerationError(new Error('503 Service Unavailable')).message).toMatch(
      /temporarily unavailable/i
    );
  });

  it('falls back to a generic message for anything unrecognised', () => {
    const result = describeGenerationError(new Error('kaboom'));

    expect(result.message).toMatch(/something went wrong/i);
    expect(result.action).toBeUndefined();
  });

  it('handles non-Error throws', () => {
    expect(describeGenerationError('just a string').message).toBeTruthy();
    expect(describeGenerationError(null).message).toBeTruthy();
    expect(describeGenerationError(undefined).message).toBeTruthy();
  });

  // The point of the helper: developer-facing text must never reach the UI.
  it('never echoes the raw message, including a key-bearing URL', () => {
    const leaky = new Error(
      'fetch failed: POST https://generativelanguage.googleapis.com/v1/models:generateContent?key=AIzaSyLEAKED12345 returned 400'
    );

    const result = describeGenerationError(leaky);

    expect(result.message).not.toContain('AIzaSyLEAKED12345');
    expect(result.message).not.toContain('generativelanguage');
    expect(result.message).not.toContain('key=');
  });

  // Users no longer supply a key, so there is nothing actionable in Settings and
  // the constant must NOT offer a link that would dead-end.
  it('exposes a generation-unavailable constant with no Settings action', () => {
    expect(GENERATION_UNAVAILABLE.action).toBeUndefined();
    expect(GENERATION_UNAVAILABLE.message).toMatch(/unavailable/i);
  });
});
