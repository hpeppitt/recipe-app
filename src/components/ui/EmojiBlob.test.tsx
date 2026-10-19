// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmojiBlob } from './EmojiBlob';

describe('EmojiBlob', () => {
  it('is hidden from assistive tech by default', () => {
    const { container } = render(<EmojiBlob emoji="🍝" size={76} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('is an image with the label when one is given', () => {
    render(<EmojiBlob emoji="🍝" size={76} label="Pasta" />);
    expect(screen.getByRole('img', { name: 'Pasta' })).toBeTruthy();
  });

  it('renders children instead of the emoji', () => {
    render(<EmojiBlob size={84}><svg data-testid="icon" /></EmojiBlob>);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });
});
