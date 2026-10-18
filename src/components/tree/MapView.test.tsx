// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MapView } from './MapView';
import { makeRecipe } from '../../test/factories';
import type { Recipe } from '../../types/recipe';

const rec = (id: string, parent: Recipe | null, o: Partial<Recipe> = {}) =>
  makeRecipe({ id, parentId: parent?.id ?? null, rootId: 'r', depth: parent ? parent.depth + 1 : 0, title: `T-${id}`, ...o });

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const onShowTimeline = vi.fn();
const draw = (recipes: Recipe[], currentId?: string) =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<MapView recipes={recipes} currentId={currentId} onShowTimeline={onShowTimeline} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  onShowTimeline.mockClear();
  // jsdom has no dialog behaviour; model open and close including the close event.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(cleanup);

const root = rec('r', null, { emoji: '🥞' });
const a = rec('a', root, { createdBy: { uid: 'u', displayName: 'Sam' } });
const b = rec('b', root);
const a1 = rec('a1', a);

describe('MapView', () => {
  it('renders a root-only family with the original card and no path edges', () => {
    const { container } = draw([root], 'r');
    expect(screen.getAllByRole('button', { name: /generation/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'T-r, generation 0, current version' })).toBeTruthy();
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(screen.getByText('The original · by Anonymous')).toBeTruthy();
    expect(screen.queryByText(/big for the map/)).toBeNull();
  });

  it('names nodes by title, not emoji, and marks path edges', () => {
    const { container } = draw([root, a, b, a1], 'a1');
    expect(screen.getByRole('button', { name: 'T-b, generation 1' }).getAttribute('aria-label')).not.toContain('🥞');
    const flags = [...container.querySelectorAll('line')].map((l) => l.getAttribute('data-path'));
    expect(flags.filter((f) => f === 'true')).toHaveLength(2); // r-a and a-a1
    expect(flags.filter((f) => f === 'false')).toHaveLength(1); // r-b
  });

  it('selects the current recipe by default and updates the card on selection', () => {
    draw([root, a, b, a1], 'a1');
    expect(screen.getByText('Generation 2 · by Anonymous')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'T-a1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'T-a, generation 1' }));
    expect(screen.getByText('Generation 1 · by Sam')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'T-a' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('where').textContent).toBe('/recipe/a');
  });

  it('shows the notice only above 20 versions and its button switches to the timeline', () => {
    const family = (n: number) => {
      const all = [root];
      for (let i = 1; i < n; i++) all.push(rec(`n${i}`, root));
      return all;
    };
    draw(family(20), 'r');
    expect(screen.queryByText('This family is big for the map. The timeline reads better.')).toBeNull();
    cleanup();
    draw(family(21), 'r');
    expect(screen.getByText('This family is big for the map. The timeline reads better.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /generation/ })).toHaveLength(21); // the map still renders
    fireEvent.click(screen.getByRole('button', { name: 'Show timeline' }));
    expect(onShowTimeline).toHaveBeenCalledTimes(1);
  });

  it('opens full screen with a labelled scroll region and returns focus to the expand button on close', () => {
    draw([root, a], 'r');
    const expand = screen.getByRole('button', { name: 'Full screen map' });
    expand.focus();
    fireEvent.click(expand);
    const dialog = screen.getByRole('dialog', { name: 'Version map' });
    expect(within(dialog).getByRole('region').getAttribute('tabindex')).toBe('0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'T-a, generation 1' }));
    expect(within(dialog).getByRole('heading', { name: 'T-a' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close map' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(expand);
  });

  it('closes on Escape (the native cancel path ends in close)', () => {
    draw([root], 'r');
    const expand = screen.getByRole('button', { name: 'Full screen map' });
    fireEvent.click(expand);
    const dialog = screen.getByRole('dialog');
    dialog.removeAttribute('open'); // the browser closes the dialog, then fires close
    fireEvent(dialog, new Event('close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(expand);
  });

  it('shows the notice for a deep family under 21 versions', () => {
    let parent = root;
    const chain = [root];
    for (let i = 1; i <= 4; i++) {
      parent = rec(`d${i}`, parent);
      chain.push(parent);
    }
    draw(chain.slice(0, 4), 'r'); // generations 0 to 3
    expect(screen.queryByText(/big for the map/)).toBeNull();
    cleanup();
    draw(chain, 'r'); // generation 4
    expect(screen.getByText(/big for the map/)).toBeTruthy();
  });

  it('caps the inline width at 1.5x the viewBox so a small family is not a giant disc', () => {
    const { container } = draw([root], 'r');
    const svg = container.querySelector('svg.block')!;
    const size = +svg.getAttribute('viewBox')!.split(' ')[2];
    expect((svg.parentElement as HTMLElement).style.maxWidth).toBe(`${size * 1.5}px`);
  });

  it('puts the expand button before the nodes in tab order', () => {
    draw([root, a], 'r');
    const all = screen.getAllByRole('button');
    expect(all[0].getAttribute('aria-label')).toBe('Full screen map');
  });

  it('centres the selected node when full screen opens', () => {
    const set: Array<[string, number]> = [];
    for (const k of ['scrollLeft', 'scrollTop'] as const) {
      Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => 0, set: (v: number) => set.push([k, v]) });
    }
    try {
      draw([root, a], 'a');
      fireEvent.click(screen.getByRole('button', { name: 'Full screen map' }));
      // jsdom has no layout (client size 0), so the target is the node's own scaled position.
      expect(set.map(([k]) => k).sort()).toEqual(['scrollLeft', 'scrollTop']);
      expect(set.some(([, v]) => v !== 0)).toBe(true);
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTop;
    }
  });
});
