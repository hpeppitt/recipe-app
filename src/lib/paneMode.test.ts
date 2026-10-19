import { describe, it, expect } from 'vitest';
import { paneMode, listOriginState } from './paneMode';

describe('paneMode', () => {
  it('pairs a recipe with the Explore list on a wide screen', () => {
    expect(paneMode('/recipe/abc', listOriginState('/'), true)).toEqual({ listPath: '/', recipeId: 'abc' });
  });

  it('pairs a recipe with the Saved list on a wide screen', () => {
    expect(paneMode('/recipe/abc', listOriginState('/saved'), true)).toEqual({ listPath: '/saved', recipeId: 'abc' });
  });

  it('is off below the wide breakpoint, whatever the state', () => {
    expect(paneMode('/recipe/abc', listOriginState('/'), false)).toBeNull();
    expect(paneMode('/recipe/abc', listOriginState('/saved'), false)).toBeNull();
  });

  it('is off for a direct visit or reload, which carries no list origin', () => {
    expect(paneMode('/recipe/abc', null, true)).toBeNull();
    expect(paneMode('/recipe/abc', undefined, true)).toBeNull();
    expect(paneMode('/recipe/abc', { saved: 'cloud' }, true)).toBeNull();
  });

  it('ignores an origin that is not a two-pane list', () => {
    expect(paneMode('/recipe/abc', { listOrigin: '/activity' }, true)).toBeNull();
    expect(paneMode('/recipe/abc', 'nonsense', true)).toBeNull();
  });

  it('is off on every other route, including recipe sub-routes', () => {
    for (const path of ['/', '/saved', '/recipe/abc/edit', '/recipe/abc/tree', '/recipe/abc/vary', '/recipe/abc/suggestion/s1', '/shared/abc']) {
      expect(paneMode(path, listOriginState('/'), true)).toBeNull();
    }
  });

  it('decodes the id the way useParams does', () => {
    expect(paneMode('/recipe/a%20b', listOriginState('/'), true)?.recipeId).toBe('a b');
    expect(paneMode('/recipe/a%E0', listOriginState('/'), true)?.recipeId).toBe('a%E0');
  });
});
