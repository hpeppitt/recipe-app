// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button danger variant', () => {
  it('keeps white text in light and pins ink text in dark (RL-117)', () => {
    render(<Button variant="danger">Delete</Button>);
    const cls = screen.getByRole('button', { name: 'Delete' }).className.split(' ');
    expect(cls).toEqual(expect.arrayContaining(['bg-danger-600', 'text-white', 'dark:text-on-accent']));
  });
});
