// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TreeIntro } from './TreeIntro';

afterEach(cleanup);

const SENTENCE = 'An original recipe with two branches; one branch has its own branch, marked Here.';

describe('TreeIntro', () => {
  it('has the visible heading', () => {
    render(<TreeIntro onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Every recipe can grow branches' })).toBeTruthy();
  });

  it('names the region by its heading and the two buttons exactly', () => {
    render(<TreeIntro onDismiss={() => {}} onOpenTree={() => {}} />);
    expect(screen.getByRole('region', { name: 'Every recipe can grow branches' })).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Got it', 'See the tree']);
  });

  it('lists the three steps in order', () => {
    render(<TreeIntro onDismiss={() => {}} />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      '1Someone asks for a change, like "less sugar".',
      '2A new version grows off it. The original never changes.',
      '3The terracotta line shows how you got here.',
    ]);
  });

  it('describes the diagram once, in text, and hides the drawing from assistive tech', () => {
    const { container } = render(<TreeIntro onDismiss={() => {}} />);
    const sentence = screen.getByText(SENTENCE);
    expect(sentence.className).toContain('sr-only');
    expect(sentence.closest('[aria-hidden="true"]')).toBeNull();
    const diagram = container.querySelector('[aria-hidden="true"]:not(span)')!;
    for (const t of ['Banana bread', 'Original', '"less sugar"', '"extra banana"', '"add chocolate"', 'Here']) {
      expect(diagram.textContent).toContain(t);
    }
    expect(diagram.querySelectorAll('button, a, [tabindex]').length).toBe(0);
  });

  it('Got it dismisses exactly once and does not open the tree', () => {
    const onDismiss = vi.fn();
    const onOpenTree = vi.fn();
    render(<TreeIntro onDismiss={onDismiss} onOpenTree={onOpenTree} />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpenTree).not.toHaveBeenCalled();
  });

  it('offers See the tree only when the recipe has children', () => {
    const { unmount } = render(<TreeIntro onDismiss={() => {}} />);
    expect(screen.queryByRole('button', { name: 'See the tree' })).toBeNull();
    unmount();
    const onDismiss = vi.fn();
    const onOpenTree = vi.fn();
    render(<TreeIntro onDismiss={onDismiss} onOpenTree={onOpenTree} />);
    fireEvent.click(screen.getByRole('button', { name: 'See the tree' }));
    expect(onOpenTree).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the enclosing main when Got it is pressed, so it is not lost', () => {
    render(
      <main>
        <TreeIntro onDismiss={() => {}} />
      </main>
    );
    const got = screen.getByRole('button', { name: 'Got it' });
    got.focus();
    fireEvent.click(got);
    const main = screen.getByRole('main');
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');
    fireEvent.blur(main);
    expect(main.hasAttribute('tabindex')).toBe(false);
  });
});
