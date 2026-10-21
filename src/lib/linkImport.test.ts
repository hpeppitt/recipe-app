import { describe, it, expect } from 'vitest';
import { IMPORT_ERROR_MESSAGE, IMPORT_LIMITS, PHOTO_SOURCE, badAmountRows, fromReviewRows, importHost, reviewSummary, toReviewRows, normalizeImportUrl, sharedImportUrl, toImportDraft, withBoundedImportedFrom } from './linkImport';
import { makeIngredient, makeRecipe } from '../test/factories';
import { ImportedFromSchema } from '../schemas/recipe.schema';

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

describe('withBoundedImportedFrom', () => {
  it('keeps a bounded http(s) importedFrom and returns a recipe without one unchanged', () => {
    const r = makeRecipe({ importedFrom: 'https://a.com/x' });
    expect(withBoundedImportedFrom(r)).toEqual(r);
    const plain = makeRecipe();
    expect(withBoundedImportedFrom(plain)).toBe(plain);
  });

  it('drops an importedFrom that is not a bounded http(s) URL and keeps the rest', () => {
    for (const bad of ['javascript:alert(1)', 'javascript:x', 'Photo', 'photo ', 'photo2', `https://a.com/${'x'.repeat(2048)}`, 42, null]) {
      const out = withBoundedImportedFrom({ id: 'a', title: 'T', importedFrom: bad });
      expect(out).toEqual({ id: 'a', title: 'T' });
    }
  });
});

describe('ImportedFromSchema (RL-263)', () => {
  it("accepts exactly 'photo' and a bounded http(s) URL, and drops anything else", () => {
    expect(ImportedFromSchema.parse(PHOTO_SOURCE)).toBe('photo');
    expect(ImportedFromSchema.parse('https://a.com/x')).toBe('https://a.com/x');
    for (const bad of ['Photo', 'photo ', 'javascript:x']) expect(ImportedFromSchema.parse(bad)).toBeUndefined();
  });

  it("keeps 'photo' through withBoundedImportedFrom", () => {
    const r = makeRecipe({ importedFrom: PHOTO_SOURCE });
    expect(withBoundedImportedFrom(r)).toEqual(r);
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

describe('import review rows (RL-252)', () => {
  const ing = (over: object) => ({ amount: 2, unit: 'cup', name: 'flour', notes: 'sifted', group: null, ...over });

  it('round-trips rows, keeps notes and group, and drops the uncertain flag', () => {
    const out = fromReviewRows(toReviewRows([ing({}), ing({ amount: null, unit: null, uncertain: true })]));
    expect(out[0]).toMatchObject({ amount: 2, unit: 'cup', notes: 'sifted' });
    expect(out[1]).toMatchObject({ amount: null, unit: null });
    expect(out.every((i) => i.uncertain === undefined)).toBe(true);
  });

  it('flags only uncertain rows, with a blank amount', () => {
    const rows = toReviewRows([ing({}), ing({ amount: null, uncertain: true })]);
    expect(rows.map((r) => r.flagged)).toEqual([false, true]);
    expect(rows[1].amount).toBe('');
  });

  it('turns blank and unparseable amounts into null, never a guess', () => {
    const [row] = toReviewRows([ing({})]);
    expect(fromReviewRows([{ ...row, amount: '' }])[0].amount).toBeNull();
    expect(fromReviewRows([{ ...row, amount: 'abc' }])[0].amount).toBeNull();
    expect(fromReviewRows([{ ...row, amount: '0.75' }])[0].amount).toBe(0.75);
  });

  it('finds typed amounts that are not numbers', () => {
    const rows = toReviewRows([ing({}), ing({}), ing({ amount: null, uncertain: true })]);
    rows[0].amount = '1/2';
    rows[1].amount = '1.5';
    expect(badAmountRows(rows)).toEqual([0]);
  });

  it('words the summary', () => {
    expect(reviewSummary(8, 6, 1)).toBe('8 ingredients, 6 steps read. One amount was unclear.');
    expect(reviewSummary(8, 6, 3)).toBe('8 ingredients, 6 steps read. 3 amounts were unclear.');
    expect(reviewSummary(1, 1, 0)).toBe('1 ingredient, 1 step read. All amounts read clearly.');
  });
});

describe('sharedImportUrl', () => {
  const q = (s: string) => sharedImportUrl(new URLSearchParams(s));
  it('prefers url, then the first http(s) link in text', () => {
    expect(q('url=https%3A%2F%2Fa.com%2Fr&text=https%3A%2F%2Fb.com')).toBe('https://a.com/r');
    expect(q('title=Stew&text=Try%20this%20http%3A%2F%2Fb.com%2Fstew.%20Yum%20https%3A%2F%2Fc.com')).toBe('http://b.com/stew');
  });
  it('is null for nothing usable or unsafe input', () => {
    expect(q('')).toBeNull();
    expect(q('text=no%20link%20here')).toBeNull();
    expect(q('text=javascript%3Aalert(1)')).toBeNull();
    expect(q('url=http%3A%2F%2F127.0.0.1%2Fx')).toBeNull();
  });
});
