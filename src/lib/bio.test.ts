import { describe, it, expect } from 'vitest';
import { cleanBio, BIO_MAX } from './bio';

describe('cleanBio', () => {
  it('trims, joins lines and returns null when empty or not a string', () => {
    expect(cleanBio('  hi\nthere  ')).toBe('hi there');
    expect(cleanBio(' \n ')).toBeNull();
    expect(cleanBio(undefined)).toBeNull();
    expect(cleanBio(42)).toBeNull();
  });
  it('caps at 160 and never keeps half an emoji', () => {
    expect(cleanBio('a'.repeat(300))).toHaveLength(BIO_MAX);
    const cut = cleanBio('a'.repeat(159) + '🍕');
    expect(cut).toBe('a'.repeat(159));
  });
});
