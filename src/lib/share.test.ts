import { describe, it, expect } from 'vitest';
import { pickShareUrl, cloudShareUrl, hashShareUrl, decodeRecipeFromHash } from './share';
import { compressToEncodedURIComponent } from 'lz-string';
import { makeRecipe, makeIngredient } from '../test/factories';

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

  const hashOf = (payload: unknown) =>
    `#r=${compressToEncodedURIComponent(typeof payload === 'string' ? payload : JSON.stringify(payload))}`;
  const validPayload = () => {
    const r = makeRecipe({ title: 'Stew', ingredients: [makeIngredient('flour')] });
    return JSON.parse(JSON.stringify(decodeRecipeFromHash(new URL(hashShareUrl(r, ORIGIN)).hash)));
  };

  it('round-trips every shared field', () => {
    const r = makeRecipe({ title: 'Stew', nutrition: { calories: 1, protein: 2, carbs: 3, fat: 4 } });
    const decoded = decodeRecipeFromHash(new URL(hashShareUrl(r, ORIGIN)).hash);
    expect(decoded).toEqual({
      title: r.title,
      description: r.description,
      emoji: r.emoji,
      ingredients: r.ingredients,
      instructions: r.instructions,
      notes: r.notes,
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      totalTime: r.totalTime,
      servings: r.servings,
      difficulty: r.difficulty,
      tags: r.tags,
      nutrition: r.nutrition,
      createdBy: r.createdBy,
    });
  });

  it('accepts an old link with no createdBy and no nutrition', () => {
    const { createdBy: _c, nutrition: _n, ...old } = validPayload();
    expect(decodeRecipeFromHash(hashOf(old))?.title).toBe('Stew');
  });

  it('returns null when ingredients is missing or a string', () => {
    const { ingredients: _i, ...missing } = validPayload();
    expect(decodeRecipeFromHash(hashOf(missing))).toBeNull();
    expect(decodeRecipeFromHash(hashOf({ ...validPayload(), ingredients: 'flour' }))).toBeNull();
  });

  it('strips unknown keys, nested ones included', () => {
    const p = validPayload();
    p.extra = 'x';
    p.ingredients[0].evil = 1;
    const decoded = decodeRecipeFromHash(hashOf(p));
    expect(decoded).not.toHaveProperty('extra');
    expect(decoded?.ingredients[0]).not.toHaveProperty('evil');
  });

  it('returns null for non-JSON, non-object and garbage input', () => {
    expect(decodeRecipeFromHash(hashOf('not json'))).toBeNull();
    expect(decodeRecipeFromHash(hashOf('42'))).toBeNull();
    expect(decodeRecipeFromHash(hashOf('null'))).toBeNull();
    expect(decodeRecipeFromHash('#r=!!!')).toBeNull();
  });

  it('returns null for a createdBy of the wrong shape', () => {
    expect(decodeRecipeFromHash(hashOf({ ...validPayload(), createdBy: 'me' }))).toBeNull();
    expect(decodeRecipeFromHash(hashOf({ ...validPayload(), createdBy: { uid: 5 } }))).toBeNull();
  });

  it('keeps importedFrom and importedVia when present and adds neither when absent', () => {
    const via = { uid: 'u1', displayName: 'Ann' };
    const imported = makeRecipe({ importedFrom: 'https://seriouseats.com/stew', importedVia: via });
    const decoded = decodeRecipeFromHash(new URL(hashShareUrl(imported, ORIGIN)).hash);
    expect(decoded?.importedFrom).toBe('https://seriouseats.com/stew');
    expect(decoded?.importedVia).toEqual(via);

    const plain = decodeRecipeFromHash(new URL(hashShareUrl(makeRecipe(), ORIGIN)).hash);
    expect(plain).not.toHaveProperty('importedFrom');
    expect(plain).not.toHaveProperty('importedVia');
  });

  it('drops an importedFrom that is not a bounded http(s) URL and keeps the rest of the link', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', `https://a.com/${'x'.repeat(2048)}`, 5]) {
      const decoded = decodeRecipeFromHash(hashOf({ ...validPayload(), importedFrom: bad }));
      expect(decoded?.title).toBe('Stew');
      expect(decoded?.importedFrom).toBeUndefined();
    }
    expect(decodeRecipeFromHash(hashOf({ ...validPayload(), importedFrom: 'http://a.com/x' }))?.importedFrom).toBe(
      'http://a.com/x'
    );
  });
});
