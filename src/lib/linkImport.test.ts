import { describe, it, expect } from 'vitest';
import { IMPORT_ERROR_MESSAGE, IMPORT_LIMITS, importHost, normalizeImportUrl, toImportDraft } from './linkImport';
import { makeIngredient, makeRecipe } from '../test/factories';

describe('normalizeImportUrl', () => {
  it('trims and adds https:// when the scheme is missing', () => {
    expect(normalizeImportUrl('  seriouseats.com/recipes/stew  ')).toBe('https://seriouseats.com/recipes/stew');
  });

  it('keeps http and https as given', () => {
    expect(normalizeImportUrl('http://example.org/a')).toBe('http://example.org/a');
    expect(normalizeImportUrl('https://www.bbcgoodfood.com/x?y=1')).toBe('https://www.bbcgoodfood.com/x?y=1');
  });

  it('rejects other schemes and junk', () => {
    for (const bad of ['', '   ', 'ftp://example.com/x', 'javascript:alert(1)', 'mailto:a@b.com', 'file:///etc/passwd', 'not a url']) {
      expect(normalizeImportUrl(bad)).toBeNull();
    }
  });

  it('rejects localhost, IP literals and non-public hosts', () => {
    for (const bad of [
      'localhost:5173/x',
      'http://app.localhost/',
      'http://127.0.0.1/',
      '192.168.1.10/recipe',
      'http://0x7f.1/',
      'http://2130706433/',
      'http://[::1]/',
      'http://intranet/',
      'printer.local',
      'wiki.corp/recipes',
      'https://user:pw@example.com/',
    ]) {
      expect(normalizeImportUrl(bad), bad).toBeNull();
    }
  });
});

describe('importHost', () => {
  it('returns the host without www and without the path', () => {
    expect(importHost('https://www.seriouseats.com/recipes/2020/stew')).toBe('seriouseats.com');
    expect(importHost('https://cooking.nytimes.com/x')).toBe('cooking.nytimes.com');
  });

  it('returns an empty string for something that is not a URL', () => {
    expect(importHost('nope')).toBe('');
  });
});

describe('toImportDraft', () => {
  const SOURCE = 'https://seriouseats.com/stew';
  function output(ingredients: unknown[]) {
    const { id, parentId, rootId, depth, createdBy, collaborators, prompt, chatHistory, createdAt, updatedAt, ...rest } =
      makeRecipe({ title: 'Stew', instructions: [{ step: 1, text: 'Simmer.', group: null }] });
    return { ...rest, ingredients, nutrition: null };
  }

  it('returns the recipe with its source and no uncertain amounts', () => {
    const draft = toImportDraft(JSON.stringify(output([{ ...makeIngredient('beef'), uncertain: false }])), SOURCE);
    expect(draft.error).toBeNull();
    expect(draft.uncertainCount).toBe(0);
    expect(draft.recipe?.title).toBe('Stew');
    expect(draft.recipe?.importedFrom).toBe(SOURCE);
  });

  it('counts uncertain ingredients and forces their amount to null', () => {
    const draft = toImportDraft(
      JSON.stringify(
        output([
          { ...makeIngredient('beef'), uncertain: true, amount: 2 },
          { ...makeIngredient('salt'), amount: null, uncertain: true },
          makeIngredient('water'),
        ])
      ),
      SOURCE
    );
    expect(draft.uncertainCount).toBe(2);
    expect(draft.recipe?.ingredients.map((i) => i.amount)).toEqual([null, null, 1]);
    expect(draft.recipe?.ingredients[0].uncertain).toBe(true);
  });

  it('repairs code fences and trailing commas', () => {
    const text = '```json\n' + JSON.stringify(output([makeIngredient('beef')])).replace(/}$/, ',}') + '\n```';
    expect(toImportDraft(text, SOURCE).error).toBeNull();
  });

  it('returns the import error for invalid JSON, a wrong shape or a page with no recipe', () => {
    for (const text of ['not json', JSON.stringify({ title: 'x' }), JSON.stringify(output([]))]) {
      expect(toImportDraft(text, SOURCE)).toEqual({ recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE });
    }
  });

  it('accepts a draft at the firestore.rules caps and refuses one past any of them', () => {
    const ing = makeIngredient('beef');
    const step = { step: 1, text: 'Simmer.', group: null };
    const at = { ...output(Array(IMPORT_LIMITS.ingredients).fill(ing)), title: 'x'.repeat(IMPORT_LIMITS.title) };
    expect(toImportDraft(JSON.stringify(at), SOURCE).error).toBeNull();

    const failed = { recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE };
    for (const over of [
      { ...output([ing]), title: 'x'.repeat(IMPORT_LIMITS.title + 1) },
      output(Array(IMPORT_LIMITS.ingredients + 1).fill(ing)),
      { ...output([ing]), instructions: Array(IMPORT_LIMITS.instructions + 1).fill(step) },
    ]) {
      expect(toImportDraft(JSON.stringify(over), SOURCE)).toEqual(failed);
    }
  });
});
