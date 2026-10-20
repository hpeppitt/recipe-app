// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within, cleanup } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
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

const pill = () => screen.getByRole('button', { name: /Path/ });
const dots = () => screen.getByTestId('generation-dots').children;

describe('LineageStrip pill and Path panel', () => {
  it('renders nothing on an original', () => {
    const { container } = renderWithProviders(<LineageStrip recipe={makeRecipe({ depth: 0 })} ancestors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says Generation N from the loaded chain, ignoring a stale depth', () => {
    show(2);
    expect(screen.getByText(/Generation 3/).closest('span')).toHaveTextContent('Generation 3 · from Title 1');
    cleanup();
    show(1, { depth: 7 });
    expect(screen.getByText(/Generation 2/)).toBeInTheDocument();
  });

  it('while loading shows Generation depth+1 with no from part', () => {
    const recipe = makeRecipe({ id: 'cur', depth: 2, parentId: 'p' });
    renderWithProviders(<LineageStrip recipe={recipe} ancestors={[]} />);
    expect(screen.getByText(/Generation 3/).closest('span')?.textContent).toBe('Generation 3');
  });

  it('draws one dot per generation, the last in accent, capped at 6', () => {
    show(2);
    expect(dots()).toHaveLength(3);
    expect(dots()[2]).toHaveClass('bg-accent');
    expect(dots()[1]).toHaveClass('bg-neutral-500');
    cleanup();
    show(8);
    expect(dots()).toHaveLength(6);
    expect(dots()[5]).toHaveClass('bg-accent');
  });

  it('Path toggles the panel with rows root to current', () => {
    show(2);
    expect(pill()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(pill());
    expect(pill()).toHaveAttribute('aria-expanded', 'true');
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('🍌 Title 0');
    expect(rows[0]).toHaveTextContent('Original · Someone');
    expect(rows[2]).toHaveTextContent('Current');
    expect(rows[2]).toHaveTextContent('"less salt" · Ana · you are here');
    fireEvent.click(pill());
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('does not label row 0 Original while the lineage loads', () => {
    renderWithProviders(<LineageStrip recipe={makeRecipe({ id: 'cur', depth: 1, parentId: 'p', prompt: 'x' })} ancestors={[]} />);
    fireEvent.click(pill());
    expect(screen.getByRole('list')).not.toHaveTextContent('Original');
  });

  it('Compare links to every ancestor and not the current row', () => {
    show(2);
    fireEvent.click(pill());
    const hrefs = screen.getAllByRole('link', { name: /^Compare/ }).map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/recipe/cur/changes?vs=a0', '/recipe/cur/changes?vs=a1']);
  });

  it('Escape closes the panel and returns focus to Path', () => {
    show(1);
    fireEvent.click(pill());
    fireEvent.keyDown(screen.getByRole('list'), { key: 'Escape' });
    expect(screen.queryByRole('list')).toBeNull();
    expect(pill()).toHaveFocus();
  });

  it('closes when the recipe changes', () => {
    const ancestors = chain(1);
    function Harness() {
      const [id, setId] = useState('x');
      return (
        <>
          <button onClick={() => setId('y')}>switch</button>
          <LineageStrip recipe={makeRecipe({ id, depth: 1, parentId: 'a0' })} ancestors={ancestors} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    fireEvent.click(pill());
    expect(screen.getByRole('list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.queryByRole('list')).toBeNull();
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
  });});

describe('LineageStrip list origin', () => {
  function State() {
    return <div data-testid="state">{JSON.stringify(useLocation().state)}</div>;
  }
  const root = makeRecipe({ id: 'root', title: 'Root' });
  const recipe = makeRecipe({ id: 'cur', title: 'Current', depth: 1, parentId: 'root', rootId: 'root' });
  const renderAt = (state?: unknown) =>
    renderWithProviders(
      <Routes>
        <Route path="*" element={<><LineageStrip recipe={recipe} ancestors={[root]} /><State /></>} />
      </Routes>,
      { route: { pathname: '/recipe/cur', state } }
    );

  it('passes the list origin on a row title, so the hop stays beside the list', () => {
    renderAt({ listOrigin: '/' });
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('link', { name: /^[^C]*Root$/ }));
    expect(screen.getByTestId('state')).toHaveTextContent('{"listOrigin":"/"}');
  });

  it('passes no state without one', () => {
    renderAt({ saved: 'cloud' });
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('link', { name: /^[^C]*Root$/ }));
    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });
});
