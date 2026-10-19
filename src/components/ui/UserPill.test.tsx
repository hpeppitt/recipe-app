// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserPill } from './UserPill';

describe('UserPill', () => {
  it('shows the display name', () => {
    render(<UserPill uid="u1" name="Maria" />);
    expect(screen.getByText('Maria')).toBeTruthy();
  });

  it('falls back to Anonymous', () => {
    render(<UserPill uid="u1" name={null} />);
    expect(screen.getByText('Anonymous')).toBeTruthy();
  });
});
