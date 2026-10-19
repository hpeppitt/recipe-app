// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RecipeTileGrid, TILE_TINTS } from './RecipeTileGrid';

const tile = (n: number) => ({ id: `r${n}`, emoji: '🍝', title: `Recipe ${n}`, meta: `meta ${n}` });

describe('RecipeTileGrid', () => {
  it('links each tile to its recipe and shows title and meta in the link name', () => {
    renderWithProviders(<RecipeTileGrid tiles={[tile(1), tile(2)]} />);
    const link = screen.getByRole('link', { name: /Recipe 2/ });
    expect(link).toHaveAttribute('href', '/recipe/r2');
    expect(within(link).getByText('meta 2')).toBeInTheDocument();
  });

  it('rotates the tint by index and wraps after three', () => {
    const { container } = renderWithProviders(<RecipeTileGrid tiles={[1, 2, 3, 4].map(tile)} />);
    const squares = Array.from(container.querySelectorAll('li a > div'));
    expect(squares.map((s) => TILE_TINTS.find((t) => s.classList.contains(t)))).toEqual([
      'bg-accent-200',
      'bg-accent-2-200',
      'bg-surface-secondary',
      'bg-accent-200',
    ]);
  });

  it('says Nothing here yet. with no tiles and renders no links', () => {
    renderWithProviders(<RecipeTileGrid tiles={[]} />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
