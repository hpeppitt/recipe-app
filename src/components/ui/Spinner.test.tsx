// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('spins only under motion-safe, never bare', () => {
    render(<Spinner />);
    const classes = screen.getByRole('status', { name: 'Loading' }).className.split(/\s+/);
    expect(classes).toContain('motion-safe:animate-spin');
    expect(classes).not.toContain('animate-spin');
  });
});
