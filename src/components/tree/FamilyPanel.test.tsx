// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeRecipe } from '../../test/factories';
import { buildTree } from '../../lib/tree';
import { FamilyPanel } from './FamilyPanel';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const root = makeRecipe({ id: 'root', parentId: null, rootId: 'root', title: 'Soup' });
const v1 = makeRecipe({ id: 'v1', parentId: 'root', rootId: 'root', title: 'Spicy Soup' });
const recipes = [root, v1];

// jsdom has no showModal; model open/close so the dialog's content is reachable.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function Harness() {
  const [open, setOpen] = useState(true);
  return <FamilyPanel open={open} onClose={() => setOpen(false)} recipe={v1} recipes={recipes} tree={buildTree(recipes)} />;
}

describe('FamilyPanel', () => {
  beforeEach(() => navigateSpy.mockClear());

  it('shows the family title and the tree by default', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByRole('heading', { name: 'Soup family' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Tree' }).getAttribute('aria-checked')).toBe('true');
  });

  it('the segmented control switches views', () => {
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: 'Timeline' }));
    expect(screen.getByRole('radio', { name: 'Timeline' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Map' }));
    expect(screen.getByRole('radio', { name: 'Map' }).getAttribute('aria-checked')).toBe('true');
  });

  it('Escape (the dialog cancel event) closes it', () => {
    renderWithProviders(<Harness />);
    fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('heading', { name: 'Soup family' })).toBeNull();
  });

  it('a node tap closes the panel and opens that recipe carrying the list origin', () => {
    renderWithProviders(<Harness />, { route: { pathname: '/recipe/v1', state: { listOrigin: '/' } } });
    fireEvent.click(screen.getByText('Soup', { selector: 'p, span, h3, div' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/root', { state: { listOrigin: '/' } });
    expect(screen.queryByRole('heading', { name: 'Soup family' })).toBeNull();
  });

  it('Branch from this one closes and goes to /vary', () => {
    renderWithProviders(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch from this one' }));
    expect(navigateSpy).toHaveBeenCalledWith('/recipe/v1/vary');
    expect(screen.queryByRole('heading', { name: 'Soup family' })).toBeNull();
  });
});
