// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TreeView } from './TreeView';
import { buildTree } from '../../lib/tree';
import { makeRecipe } from '../../test/factories';
import type { Recipe } from '../../types/recipe';

const rec = (id: string, parent: Recipe | null, o: Partial<Recipe> = {}) =>
  makeRecipe({ id, parentId: parent?.id ?? null, rootId: 'r', depth: parent ? parent.depth + 1 : 0, title: `T-${id}`, prompt: `p-${id}`, ...o });

const draw = (recipes: Recipe[], currentId: string, onOpen = vi.fn()) => {
  const tree = buildTree(recipes)!;
  return { onOpen, ...render(<TreeView tree={tree} currentId={currentId} onOpen={onOpen} />) };
};
const paths = (c: HTMLElement, child: string) =>
  Object.fromEntries(
    [...c.querySelectorAll(`[data-child="${child}"]`)].map((e) => [e.getAttribute('data-segment'), e.getAttribute('data-path')])
  );

afterEach(cleanup);

describe('TreeView', () => {
  it('renders a lone root with no connectors', () => {
    const r = rec('r', null);
    const { container } = draw([r], 'r');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0);
    expect(screen.getByText('Original · Anonymous')).toBeTruthy();
  });

  it('draws connectors down a depth-5 chain, all on the path', () => {
    const chain: Recipe[] = [rec('r', null)];
    for (let i = 1; i <= 5; i++) chain.push(rec(`n${i}`, chain[i - 1]));
    const { container } = draw(chain, 'n5');
    expect(screen.getAllByRole('button')).toHaveLength(6);
    for (let i = 1; i <= 5; i++) expect(paths(container, `n${i}`)).toEqual({ 'rail-in': 'true', elbow: 'true' });
  });

  it('colours only the rail to the path sibling', () => {
    const r = rec('r', null);
    const a = rec('a', r, { createdAt: 1 });
    const b = rec('b', r, { createdAt: 2 });
    const c = rec('c', r, { createdAt: 3 });
    const a1 = rec('a1', a);
    const { container } = draw([r, a, b, c, a1], 'b');
    expect(paths(container, 'a')).toEqual({ 'rail-in': 'true', elbow: 'false', 'rail-out': 'true' });
    expect(paths(container, 'b')).toEqual({ 'rail-in': 'true', elbow: 'true', 'rail-out': 'false' });
    expect(paths(container, 'c')).toEqual({ 'rail-in': 'false', elbow: 'false' });
    expect(paths(container, 'a1')).toEqual({ 'rail-in': 'false', elbow: 'false' });
  });

  it('tags the current node and names it', () => {
    const r = rec('r', null);
    const a = rec('a', r);
    draw([r, a], 'a');
    expect(screen.getByText('Here')).toBeTruthy();
    expect(screen.getByRole('button', { name: /T-a.*current version/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /T-r/ }).getAttribute('aria-label')).toBeNull();
    expect(screen.queryAllByText('current version')).toHaveLength(1);
  });

  it('falls back to Variation and Anonymous, and shows names', () => {
    const r = rec('r', null, { createdBy: { uid: 'u', displayName: 'Ada' } });
    const a = rec('a', r, { prompt: '' });
    const b = rec('b', r, { createdBy: { uid: 'u2', displayName: 'Bo' } });
    draw([r, a, b], 'r');
    expect(screen.getByText('Original · Ada')).toBeTruthy();
    expect(screen.getByText('Variation · Anonymous')).toBeTruthy();
    expect(screen.getByText('"p-b" · Bo')).toBeTruthy();
  });

  it('calls onOpen with the node id', () => {
    const r = rec('r', null);
    const a = rec('a', r);
    const { onOpen } = draw([r, a], 'r');
    fireEvent.click(screen.getByRole('button', { name: /T-a/ }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('paints a path elbow above the neutral rail-out beside it', () => {
    const r = rec('r', null);
    const a = rec('a', r, { createdAt: 1 });
    const b = rec('b', r, { createdAt: 2 });
    const { container } = draw([r, a, b], 'a');
    const q = (seg: string, id: string) => container.querySelector(`[data-child="${id}"][data-segment="${seg}"]`)!;
    expect(q('rail-out', 'a').getAttribute('data-path')).toBe('false');
    expect(q('elbow', 'a').classList.contains('z-10')).toBe(true);
    expect(q('elbow', 'b').classList.contains('z-10')).toBe(false);
  });

  it('scrolls the current node into view', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const r = rec('r', null);
    const a = rec('a', r);
    draw([r, a], 'a');
    expect(spy).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
    expect(spy.mock.contexts[0]).toBe(screen.getByRole('button', { name: /T-a/ }));
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('puts the scroll container in the tab order with a name', () => {
    const r = rec('r', null);
    draw([r], 'r');
    expect(screen.getByRole('region', { name: /version tree/i }).getAttribute('tabindex')).toBe('0');
  });
});
