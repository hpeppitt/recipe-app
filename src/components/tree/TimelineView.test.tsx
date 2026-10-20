// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { TimelineView, CHAR_W } from './TimelineView';
import { makeIngredient, makeRecipe } from '../../test/factories';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Recipe } from '../../types/recipe';

const rec = (id: string, parent: Recipe | null, o: Partial<Recipe> = {}) =>
  makeRecipe({ id, parentId: parent?.id ?? null, rootId: 'r', depth: parent ? parent.depth + 1 : 0, title: `T-${id}`, prompt: `p-${id}`, ...o });

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const draw = (recipes: Recipe[], currentId?: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/" element={<TimelineView recipes={recipes} currentId={currentId} />} />
      <Route path="*" element={<Where />} />
    </Routes>
  );

beforeEach(() => {
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

const root = rec('r', null, { createdAt: 1000, ingredients: [makeIngredient('flour')] });
const kid = rec('k', root, {
  createdAt: 2000,
  prompt: 'no flour, add rice',
  ingredients: [makeIngredient('rice')],
  createdBy: { uid: 'u', displayName: 'Sam' },
});

describe('TimelineView', () => {
  it('renders each stop as a named button, the current one flagged', () => {
    draw([root, kid], 'k');
    expect(screen.getByRole('button', { name: 'T-r, Original, stop 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'T-k, Original, stop 2, current version' })).toBeTruthy();
    expect(screen.getByRole('region', { name: /timeline/i }).getAttribute('tabindex')).toBe('0');
  });

  it('renders one version as a single stop labelled Original', () => {
    const { container } = draw([root], 'r');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelector('[data-label="0"]')?.textContent).toBe('Original');
  });

  it('opens the sheet from the keyboard with line, stop, title, prompt and change tags', () => {
    draw([root, kid], 'r');
    const stop = screen.getByRole('button', { name: /^T-k,/ });
    stop.focus();
    fireEvent.keyDown(stop, { key: 'Enter' });
    fireEvent.click(stop); // a real browser turns Enter and Space on a button into click
    const dialog = screen.getByRole('dialog', { name: 'T-k' });
    expect(dialog.textContent).toContain('Original · stop 2');
    expect(dialog.textContent).toContain('"no flour, add rice" · Sam');
    expect(dialog.textContent).toContain('ago');
    const tags = [...dialog.querySelectorAll('[aria-label="What changed"] li')].map((li) => li.textContent);
    expect(tags).toEqual(['+ 1 rice', '- flour']);
  });

  it('root sheet has no tags, falls back to Variation and Anonymous, and returns focus on close', () => {
    draw([root], 'r');
    const stop = screen.getByRole('button', { name: /^T-r,/ });
    stop.focus();
    fireEvent.click(stop);
    const dialog = screen.getByRole('dialog', { name: 'T-r' });
    expect(dialog.querySelector('[aria-label="What changed"]')).toBeNull();
    expect(dialog.textContent).toContain('"p-r" · Anonymous');
    fireEvent.click(dialog); // backdrop tap: the target is the dialog itself
    expect(document.activeElement).toBe(stop);
  });

  it('Open and Branch here navigate to the right paths', () => {
    draw([root, kid], 'r');
    fireEvent.click(screen.getByRole('button', { name: /^T-k,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('where').textContent).toBe('/recipe/k');
    cleanup();
    draw([root, kid], 'r');
    fireEvent.click(screen.getByRole('button', { name: /^T-k,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Branch here' }));
    expect(screen.getByTestId('where').textContent).toBe('/recipe/k/vary');
  });

  it('See what changed shows for a child, not the root, and navigates', () => {
    draw([root, kid], 'r');
    fireEvent.click(screen.getByRole('button', { name: /^T-r,/ }));
    expect(screen.queryByRole('button', { name: 'See what changed' })).toBeNull();
    cleanup();
    draw([root, kid], 'r');
    fireEvent.click(screen.getByRole('button', { name: /^T-k,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'See what changed' }));
    expect(screen.getByTestId('where').textContent).toBe('/recipe/k/changes');
  });

  it('at 30 versions no label box overlaps a stop box', () => {
    const all: Recipe[] = [rec('n0', null, { createdAt: 1000 })];
    for (let i = 1; i < 30; i++) {
      // Every third version branches from the root so several lanes are in play.
      const parent = i % 3 === 0 ? all[0] : all[i - 1];
      all.push(rec(`n${i}`, parent, { createdAt: 1000 + i * 3_600_000, prompt: `a long prompt for version number ${i} here` }));
    }
    const { container } = draw(all, 'n29');
    expect(screen.getAllByRole('button')).toHaveLength(30);
    const stops = [...container.querySelectorAll('circle[data-stop]')].map((c) => ({ x: +c.getAttribute('cx')!, y: +c.getAttribute('cy')! }));
    const labels = [...container.querySelectorAll('text[data-label]')];
    expect(labels.length).toBeGreaterThan(1);
    for (const l of labels) {
      const x = +l.getAttribute('x')!;
      const y = +l.getAttribute('y')!;
      const w = l.textContent!.length * CHAR_W;
      for (const s of stops) {
        const hitsX = s.x + 12 > x && s.x - 12 < x + w;
        const hitsY = s.y + 12 > y - 12 && s.y - 12 < y + 3;
        expect(hitsX && hitsY).toBe(false);
      }
    }
  });

  it('truncates labels on a reused lane so no two labels intersect', () => {
    const H = 3_600_000;
    const long = 'a very long variation prompt that would run on';
    const trunk: Recipe[] = [rec('t0', null, { createdAt: 1000 })];
    const all: Recipe[] = [trunk[0]];
    // Each short branch ends before the next trunk stop, so the next branch reuses lane 1.
    for (let i = 1; i <= 8; i++) {
      const prev = trunk[i - 1];
      all.push(rec(`b${i}`, prev, { createdAt: 1000 + (2 * i - 1) * H, prompt: `${long} ${i}` }));
      const t = rec(`t${i}`, prev, { createdAt: 1000 + 2 * i * H });
      trunk.push(t);
      all.push(t);
    }
    const { container } = draw(all, 't8');
    const boxes = [...container.querySelectorAll('text[data-label]')]
      .filter((l) => l.textContent)
      .map((l) => ({ y: +l.getAttribute('y')!, x0: +l.getAttribute('x')!, x1: +l.getAttribute('x')! + l.textContent!.length * CHAR_W }));
    expect(boxes.length).toBeGreaterThan(2);
    expect(boxes.some((a) => boxes.some((b) => a !== b && a.y === b.y))).toBe(true); // a lane really is reused
    expect([...container.querySelectorAll('text[data-label]')].some((l) => l.textContent!.endsWith('...'))).toBe(true);
    for (const a of boxes) for (const b of boxes) if (a !== b && a.y === b.y) expect(a.x0 < b.x1 && b.x0 < a.x1).toBe(false);
  });
});
