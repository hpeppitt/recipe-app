import { describe, it, expect } from 'vitest';
import { cookbookTileMeta } from './cookbook';

describe('cookbookTileMeta', () => {
  it('names a branch by its prompt', () => {
    expect(cookbookTileMeta({ parentId: 'p', prompt: ' Less sugar ' })).toBe('Less sugar branch');
  });
  it('falls back to Branch when a branch has no prompt', () => {
    expect(cookbookTileMeta({ parentId: 'p', prompt: '' })).toBe('Branch');
  });
  it('calls a root Original', () => {
    expect(cookbookTileMeta({ parentId: null, prompt: 'x' })).toBe('Original');
    expect(cookbookTileMeta({})).toBe('Original');
  });
});
