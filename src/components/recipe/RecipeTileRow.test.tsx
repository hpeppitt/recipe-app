// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RecipeTileRow, type TileRecipe } from './RecipeTileRow';

const tile = (i: number, over: Partial<TileRecipe> = {}): TileRecipe => ({
  id: `r${i}`,
  emoji: '🍲',
  title: `Dish ${i}`,
  totalTime: 30,
  ...over,
});
const tiles = (n: number) => Array.from({ length: n }, (_, i) => tile(i));
const items = () => within(screen.getByRole('list')).getAllByRole('listitem');

describe('RecipeTileRow', () => {
  it('is a region named by its heading, with the heading text from the title prop', () => {
    renderWithProviders(<RecipeTileRow title="New this week" recipes={tiles(1)} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'New this week' });
    expect(screen.getByRole('region', { name: 'New this week' })).toContainElement(heading);
  });

  it('shows at most 8 tiles', () => {
    renderWithProviders(<RecipeTileRow title="Newest" recipes={tiles(10)} />);
    expect(items()).toHaveLength(8);
    expect(screen.queryByRole('link', { name: 'Open Dish 8' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Dish 7' })).toBeInTheDocument();
  });

  it('rotates the tint by index', () => {
    renderWithProviders(<RecipeTileRow title="Newest" recipes={tiles(4)} />);
    const tints = items().map((li) => li.querySelector('.size-\\[200px\\]')!.className);
    expect(tints[0]).toContain('bg-accent-200');
    expect(tints[1]).toContain('bg-accent-2-200');
    expect(tints[2]).toContain('bg-surface-secondary');
    expect(tints[3]).toContain('bg-accent-200');
  });

  it('links each tile to its recipe in order, with the author as a separate link', () => {
    renderWithProviders(
      <RecipeTileRow
        title="Newest"
        recipes={[tile(0, { createdBy: { uid: 'ana', displayName: 'Ana' } }), tile(1)]}
      />
    );
    const open = screen.getByRole('link', { name: 'Open Dish 0' });
    expect(open).toHaveAttribute('href', '/recipe/r0');
    const author = screen.getByRole('link', { name: "View Ana's profile, from Dish 0" });
    expect(author).toHaveAttribute('href', '/profile/ana');
    expect(open.contains(author)).toBe(false);
    expect(author.closest('a[href^="/recipe/"]')).toBeNull();
    // Tab order is document order: tile 0, its author, tile 1.
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/recipe/r0', '/profile/ana', '/recipe/r1']);
    // A recipe with no author data gets no author link.
    expect(within(items()[1]).queryByRole('link', { name: /profile/ })).not.toBeInTheDocument();
  });

  it('keeps the author target off the title and inside the scroller (class check; jsdom has no layout)', () => {
    renderWithProviders(<RecipeTileRow title="Newest" recipes={[tile(0, { createdBy: { uid: 'ana', displayName: 'Ana' } })]} />);
    const author = screen.getByRole('link', { name: "View Ana's profile, from Dish 0" });
    expect(author).toHaveClass('py-3', '-my-3');
    // The title wrapper reserves the 12px extension together with the li gap (8px + 4px).
    expect(screen.getByRole('heading', { level: 3 }).parentElement).toHaveClass('pb-1');
    // The scroller pads the bottom by at least the 12px extension plus the 2px ring offset and width.
    expect(screen.getByRole('list')).toHaveClass('pb-5', '-mb-3.5');
  });

  it('shows the branch tag only above 0, singular and plural', () => {
    renderWithProviders(
      <RecipeTileRow
        title="Newest"
        recipes={[tile(0, { childCount: 0 }), tile(1), tile(2, { childCount: 1 }), tile(3, { childCount: 4 })]}
      />
    );
    const [zero, none, one, many] = items();
    expect(within(zero).queryByText(/branch/)).not.toBeInTheDocument();
    expect(within(none).queryByText(/branch/)).not.toBeInTheDocument();
    expect(within(one).getByText('1 branch')).toBeInTheDocument();
    expect(within(many).getByText('4 branches')).toBeInTheDocument();
  });

  it('falls back to Untitled recipe and Anonymous, and shows the time', () => {
    renderWithProviders(
      <RecipeTileRow title="Newest" recipes={[tile(0, { title: '  ', createdBy: { uid: 'x', displayName: null } })]} />
    );
    expect(screen.getByRole('link', { name: 'Open Untitled recipe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "View Anonymous's profile, from Untitled recipe" })).toBeInTheDocument();
    expect(within(items()[0]).getByText('30 min')).toBeInTheDocument();
  });
});
