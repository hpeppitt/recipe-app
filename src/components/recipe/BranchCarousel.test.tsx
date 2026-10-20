// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, within, fireEvent, cleanup } from '@testing-library/react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { BranchCarousel } from './BranchCarousel';
import { makeRecipe, makeIngredient } from '../../test/factories';

function Where() {
  const { pathname, state } = useLocation();
  return (
    <>
      <div data-testid="where">{pathname}</div>
      <div data-testid="state">{JSON.stringify(state)}</div>
    </>
  );
}

function setup(viewed: ReturnType<typeof makeRecipe>, family: ReturnType<typeof makeRecipe>[], state?: unknown) {
  return renderWithProviders(
    <Routes>
      <Route path="*" element={<><BranchCarousel recipe={viewed} recipes={family} /><Where /></>} />
    </Routes>,
    { route: { pathname: `/recipe/${viewed.id}`, state } }
  );
}

describe('BranchCarousel', () => {
  const root = makeRecipe({ id: 'r', title: 'Pancakes', emoji: '🥞', ingredients: [makeIngredient('flour')] });
  const a = makeRecipe({
    id: 'a', parentId: 'r', rootId: 'r', depth: 1, title: 'Blueberry', prompt: 'add blueberries',
    createdAt: 10, ingredients: [makeIngredient('flour'), makeIngredient('blueberries')],
    createdBy: { uid: 'u', displayName: 'Sam' },
  });
  const b = makeRecipe({ id: 'b', parentId: 'r', rootId: 'r', depth: 1, title: 'Plain', prompt: 'no change', createdAt: 20 });
  const a1 = makeRecipe({ id: 'a1', parentId: 'a', rootId: 'r', depth: 2, createdAt: 30 });
  const family = [root, b, a, a1];

  it('shows children oldest first with tags, branch counts and author', () => {
    setup(root, family);
    expect(screen.getByText('2 ways people took it')).toBeInTheDocument();
    const slides = screen.getAllByRole('group');
    expect(slides[0]).toHaveAccessibleName('1 of 2');
    expect(within(slides[0]).getByText('add blueberries')).toBeInTheDocument();
    expect(within(slides[0]).getByText('1 branch')).toBeInTheDocument();
    expect(within(slides[0]).getByText(/^\+ .*blueberries/)).toBeInTheDocument();
    expect(within(slides[0]).getByText(/^Blueberry/)).toBeInTheDocument();
    expect(within(slides[0]).getByText('Sam')).toBeInTheDocument();
    expect(within(slides[1]).getByText('Plain')).toBeInTheDocument();
    expect(within(slides[1]).queryByText('Anonymous')).toBeNull();
    expect(within(slides[1]).queryByText(/branch/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Branches of Pancakes' })).toHaveAttribute('aria-roledescription', 'carousel');
  });

  it('renders nothing for a leaf', () => {
    const { container } = setup(a1, family);
    expect(container.querySelector('section')).toBeNull();
  });

  it('uses the singular copy for one card', () => {
    setup(root, [root, a]);
    expect(screen.getByText('1 way someone took it')).toBeInTheDocument();
  });

  it('Open goes to the card recipe', () => {
    setup(root, family);
    fireEvent.click(within(screen.getAllByRole('group')[0]).getByRole('button', { name: 'Open Blueberry' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/recipe/a');
  });

  it('Open and The original pass on the list origin, so the hop stays beside the list', () => {
    setup(a, family, { listOrigin: '/saved' });
    fireEvent.click(screen.getByRole('link', { name: /The original/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/recipe/r');
    expect(screen.getByTestId('state')).toHaveTextContent('{"listOrigin":"/saved"}');
    cleanup();
    setup(root, family, { listOrigin: '/saved' });
    fireEvent.click(within(screen.getAllByRole('group')[0]).getByRole('button', { name: 'Open Blueberry' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/recipe/a');
    expect(screen.getByTestId('state')).toHaveTextContent('{"listOrigin":"/saved"}');
  });

  it('passes no state without a list origin', () => {
    setup(root, family);
    fireEvent.click(within(screen.getAllByRole('group')[0]).getByRole('button', { name: 'Open Blueberry' }));
    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });

  it('names the dots and marks the active one, which follows a press', () => {
    setup(root, family);
    const first = screen.getByRole('button', { name: 'Show branch 1 of 2' });
    const second = screen.getByRole('button', { name: 'Show branch 2 of 2' });
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).not.toHaveAttribute('aria-current');
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(first).not.toHaveAttribute('aria-current');
  });

  it('shows The original on a variation, not on the root', () => {
    setup(a, family);
    expect(screen.getByRole('link', { name: /The original/ })).toHaveAttribute('href', '/recipe/r');
    expect(screen.getByText('Pancakes', { selector: 'p' })).toBeInTheDocument();
  });

  it('has no The original row on the root and links the tree', () => {
    setup(root, family);
    expect(screen.queryByRole('link', { name: /The original/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Version tree' })).toHaveAttribute('href', '/recipe/r/tree');
  });
});
