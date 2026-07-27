import { describe, it, expect } from 'vitest';
import { pickShareUrl, cloudShareUrl, hashShareUrl, decodeRecipeFromHash } from './share';
import { makeRecipe } from '../test/factories';

const ORIGIN = 'https://example.test';

describe('pickShareUrl', () => {
  const recipe = makeRecipe({ id: 'abc123', title: 'Tomato Soup' });

  it('uses a cloud link when Firebase is configured and the recipe is published', () => {
    const result = pickShareUrl(recipe, {
      firebaseConfigured: true,
      isPublished: true,
      origin: ORIGIN,
    });

    expect(result).toEqual({ url: `${ORIGIN}/shared/abc123`, mode: 'cloud' });
  });

  // The FUN-5 defect: a cloud link was returned purely because Firebase was
  // configured, so an unpublished recipe produced a link that 404s.
  it('falls back to a self-contained link when the recipe is not published', () => {
    const result = pickShareUrl(recipe, {
      firebaseConfigured: true,
      isPublished: false,
      origin: ORIGIN,
    });

    expect(result.mode).toBe('self-contained');
    expect(result.url).toContain('/shared#r=');
    expect(result.url).not.toBe(`${ORIGIN}/shared/abc123`);
  });

  it('uses a self-contained link when Firebase is not configured', () => {
    const result = pickShareUrl(recipe, {
      firebaseConfigured: false,
      isPublished: false,
      origin: ORIGIN,
    });

    expect(result.mode).toBe('self-contained');
  });

  it('ignores a stale isPublished when Firebase is not configured at all', () => {
    const result = pickShareUrl(recipe, {
      firebaseConfigured: false,
      isPublished: true,
      origin: ORIGIN,
    });

    expect(result.mode).toBe('self-contained');
  });
});

describe('share URL builders', () => {
  it('builds a cloud url from the recipe id', () => {
    expect(cloudShareUrl('xyz', ORIGIN)).toBe(`${ORIGIN}/shared/xyz`);
  });

  it('round-trips a recipe through the hash link', () => {
    const recipe = makeRecipe({ title: 'Round Trip Stew', description: 'hearty' });

    const url = hashShareUrl(recipe, ORIGIN);
    const decoded = decodeRecipeFromHash(new URL(url).hash);

    expect(decoded?.title).toBe('Round Trip Stew');
    expect(decoded?.description).toBe('hearty');
  });

  it('does not leak local-only fields into the hash link', () => {
    const recipe = makeRecipe({ prompt: 'my private prompt', title: 'Cake' });

    const decoded = decodeRecipeFromHash(new URL(hashShareUrl(recipe, ORIGIN)).hash);

    expect(decoded).not.toHaveProperty('prompt');
    expect(decoded).not.toHaveProperty('chatHistory');
    expect(decoded).not.toHaveProperty('id');
  });
});
