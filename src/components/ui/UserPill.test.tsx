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

  it('stays on one line by default and breaks long names with wrap', () => {
    const { container, rerender } = render(<UserPill uid="u1" name="Maria" />);
    expect(container.firstElementChild!.className).toContain('whitespace-nowrap');
    rerender(<UserPill wrap uid="u1" name="Maria" />);
    expect(container.firstElementChild!.className).not.toContain('whitespace-nowrap');
    expect(container.querySelector('span.min-w-0')!.textContent).toBe('Maria');
  });
});
