// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within, cleanup } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeRecipe } from '../../test/factories';
import { LineageStrip } from './LineageStrip';
import type { Recipe } from '../../types/recipe';

const chain = (n: number, over: (i: number) => Partial<Recipe> = () => ({})) =>
  Array.from({ length: n }, (_, i) =>
    makeRecipe({ id: `a${i}`, title: `Title ${i}`, emoji: i === 0 ? '🍌' : '🍳', depth: i, ...over(i) })
  );

function show(depth: number, current: Partial<Recipe> = {}, over?: (i: number) => Partial<Recipe>) {
  const ancestors = chain(depth, over);
  const recipe = makeRecipe({
    id: 'cur', title: 'Current', depth, parentId: `a${depth - 1}`, prompt: 'less salt',
    createdBy: { uid: 'u1', displayName: 'Ana' }, ...current,
  });
  renderWithProviders(<LineageStrip recipe={recipe} ancestors={ancestors} />);
  return { recipe, ancestors };
}

const crumbs = () => {
  const nav = screen.getByRole('navigation', { name: 'Recipe lineage' });
  return within(nav).queryAllByRole('link').map((l) => l.getAttribute('href'));
};

describe('LineageStrip crumbs', () => {
  it('renders nothing on an original', () => {
    const { container } = renderWithProviders(<LineageStrip recipe={makeRecipe({ depth: 0 })} ancestors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('depth 1: root then current, no "+N"', () => {
    show(1);
    expect(crumbs()).toEqual(['/recipe/a0']);
    expect(screen.getByRole('link', { name: 'Title 0' })).toHaveTextContent('🍌 Title 0');
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('depth 2: root, parent, current, no "+N"', () => {
    show(2);
    expect(crumbs()).toEqual(['/recipe/a0', '/recipe/a1']);
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('depth 5: root, +3, parent, current; pressing +3 shows all', () => {
    show(5);
    expect(crumbs()).toEqual(['/recipe/a0', '/recipe/a4']);
    const more = screen.getByRole('button', { name: 'Show 3 more' });
    expect(more).toHaveTextContent('+3');
    fireEvent.click(more);
    expect(crumbs()).toEqual(['/recipe/a0', '/recipe/a1', '/recipe/a2', '/recipe/a3', '/recipe/a4']);
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('marks only the current crumb as the current page', () => {
    show(2);
    const nav = screen.getByRole('navigation', { name: 'Recipe lineage' });
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Current');
    expect(current[0].tagName).not.toBe('A');
  });

  it('truncates long crumb text to 18 characters but keeps the full title in the name', () => {
    const long = 'A very long recipe title indeed';
    show(1, {}, () => ({ title: long }));
    const link = screen.getByRole('link', { name: long });
    expect(link).toHaveTextContent('🍌 A very long recipe…');
    expect(link).toHaveAttribute('title', long);
  });

  it('falls back for a blank title', () => {
    show(1, {}, () => ({ title: '  ' }));
    expect(screen.getByRole('link', { name: 'Untitled recipe' })).toBeInTheDocument();
  });
});

describe('LineageStrip sentence and button', () => {
  it('reads the prompt as a sentence with an author profile link', () => {
    show(1, {}, () => ({ title: 'Banana bread', createdBy: { uid: 'u0', displayName: 'Bo' } }));
    expect(screen.getByText(/asked for/).closest('p')).toHaveTextContent('Ana asked for "less salt" on Bo\'s Banana bread.');
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/profile/u1');
  });

  it('says "Someone" for missing names', () => {
    show(1, { createdBy: { uid: 'u1', displayName: null } }, () => ({ title: 'Soup', createdBy: { uid: 'u0', displayName: ' ' } }));
    expect(screen.getByText(/asked for/).closest('p')).toHaveTextContent('Someone asked for "less salt" on Someone\'s Soup.');
  });

  it('uses the branched-from sentence for an empty prompt, with no author link', () => {
    show(1, { prompt: '  ' }, () => ({ title: 'Soup' }));
    expect(screen.getByText(/Branched from/).closest('p')).toHaveTextContent('Branched from Soup.');
    expect(screen.queryByRole('link', { name: 'Ana' })).toBeNull();
  });

  it('links See what changed to the changes screen, not nested in another link', () => {
    show(1);
    const link = screen.getByRole('link', { name: 'See what changed' });
    expect(link).toHaveAttribute('href', '/recipe/cur/changes');
    expect(link.parentElement?.closest('a')).toBeNull();
  });

  it('while the lineage has not loaded, withholds the parent part but keeps the button', () => {
    const recipe = makeRecipe({ id: 'cur', depth: 1, parentId: 'p', prompt: 'x', createdBy: { uid: 'u1', displayName: 'Ana' } });
    renderWithProviders(<LineageStrip recipe={recipe} ancestors={[]} />);
    expect(screen.queryByRole('navigation', { name: 'Recipe lineage' })).toBeNull();
    expect(screen.getByText(/asked for/).closest('p')?.textContent).toBe('Ana asked for "x".');
    expect(screen.getByRole('link', { name: 'See what changed' })).toHaveAttribute('href', '/recipe/cur/changes');
  });

  it('while loading with an empty prompt reads "Branched from a recipe."', () => {
    const recipe = makeRecipe({ id: 'cur', depth: 1, parentId: 'p', prompt: '' });
    renderWithProviders(<LineageStrip recipe={recipe} ancestors={[]} />);
    expect(screen.getByText(/Branched from/).closest('p')?.textContent).toBe('Branched from a recipe.');
  });

  it('loaded sentence has exact text', () => {
    show(1, {}, () => ({ title: 'Soup', createdBy: { uid: 'u0', displayName: 'Bo' } }));
    expect(screen.getByText(/asked for/).closest('p')?.textContent).toBe('Ana asked for "less salt" on Bo\'s Soup.');
  });

  it('parent author falls back to Someone on its own', () => {
    show(1, {}, () => ({ title: 'Soup', createdBy: { uid: 'u0', displayName: null } }));
    expect(screen.getByText(/asked for/).closest('p')?.textContent).toBe('Ana asked for "less salt" on Someone\'s Soup.');
  });

  it('truncates at exactly 18 characters: 18 whole, 19 cut with an ellipsis', () => {
    const eighteen = 'a'.repeat(18);
    show(1, {}, () => ({ title: eighteen }));
    expect(screen.getByRole('link', { name: eighteen })).toHaveTextContent(`🍌 ${eighteen}`);
    expect(screen.getByRole('link', { name: eighteen }).textContent).not.toContain('…');
    cleanup();
    show(1, {}, () => ({ title: eighteen + 'b' }));
    expect(screen.getByRole('link', { name: eighteen + 'b' }).textContent).toBe(`🍌 ${eighteen}…`);
  });

  it('ends the row with the current title at depths 1 and 5', () => {
    show(1);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('Current');
    cleanup();
    show(5);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('Current');
  });

  it('expanding does not duplicate the root and moves focus to the first revealed crumb', () => {
    show(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getAllByRole('link', { name: 'Title 0' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Title 1' })).toHaveFocus();
  });

  it('collapses again when the recipe changes', () => {
    const ancestors = chain(5);
    function Harness() {
      const [id, setId] = useState('x');
      return (
        <>
          <button onClick={() => setId('y')}>switch</button>
          <LineageStrip recipe={makeRecipe({ id, depth: 5, parentId: 'a4' })} ancestors={ancestors} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.queryByRole('button', { name: 'Show 3 more' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
  });
});
