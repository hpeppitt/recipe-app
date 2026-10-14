import { describe, it, expect } from 'vitest';
import { formatAmount } from './amount';

describe('formatAmount', () => {
  it.each([
    [0.125, '⅛'],
    [0.13, '⅛'],
    [0.25, '¼'],
    [0.33, '⅓'],
    [0.44, '0.44'],
    [0.8, '0.8'],
    [1.5, '1½'],
    [2, '2'],
    [2.125, '2⅛'],
    [1.44, '1.44'],
    [0, '0'],
  ])('renders %s as %s', (n, out) => {
    expect(formatAmount(n)).toBe(out);
  });
});
