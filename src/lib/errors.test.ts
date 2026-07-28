import { describe, it, expect } from 'vitest';
import { describeGenerationError, MISSING_API_KEY } from './errors';

describe('describeGenerationError', () => {
  it('points an invalid key at Settings', () => {
    const result = describeGenerationError(
      new Error('[400 Bad Request] API key not valid. Please pass a valid API key.')
    );

    expect(result.action).toBe('settings');
    expect(result.message).toMatch(/rejected your API key/i);
  });

  it('treats a 403 as a key problem', () => {
    expect(describeGenerationError(new Error('403 PERMISSION_DENIED')).action).toBe('settings');
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

  it('exposes a missing-key constant that links to Settings', () => {
    expect(MISSING_API_KEY.action).toBe('settings');
    expect(MISSING_API_KEY.message).toMatch(/Settings/);
  });
});
