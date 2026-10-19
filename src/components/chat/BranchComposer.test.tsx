// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchComposer, GrowingCard } from './BranchComposer';
import { makeIngredient, makeRecipe } from '../../test/factories';

afterEach(cleanup);

const parent = makeRecipe({
  title: 'Banana bread',
  emoji: '🍌',
  ingredients: [makeIngredient('ripe bananas')],
});
const box = () => screen.getByRole('textbox', { name: 'What would you change?' }) as HTMLTextAreaElement;
const grow = () => screen.getByRole('button', { name: 'Grow this branch' }) as HTMLButtonElement;
const show = (props: Partial<React.ComponentProps<typeof BranchComposer>> = {}) =>
  render(<BranchComposer parent={parent} generating={false} onGrow={vi.fn()} {...props} />);

describe('BranchComposer', () => {
  it('names the textarea by the visible heading and starts empty', () => {
    show();
    expect(screen.getByRole('heading', { name: 'What would you change?' })).toBeTruthy();
    expect(box().value).toBe('');
    expect(box().placeholder).toBe('e.g. less sugar, and add walnuts');
  });

  it('Grow is disabled for empty and whitespace-only text, enabled once there is text', async () => {
    show();
    const u = userEvent.setup();
    expect(grow().disabled).toBe(true);
    await u.type(box(), '   ');
    expect(grow().disabled).toBe(true);
    await u.type(box(), 'walnuts');
    expect(grow().disabled).toBe(false);
  });

  it('Grow is disabled while generating and when generation is unavailable', () => {
    const { unmount } = show({ seed: 'less sugar', generating: true });
    expect(grow().disabled).toBe(true);
    unmount();
    show({ seed: 'less sugar', unavailableNotice: <p>Recipe generation is unavailable</p> });
    expect(grow().disabled).toBe(true);
    expect(screen.getByText('Recipe generation is unavailable')).toBeTruthy();
  });

  it('chips append the lower-case label, joined with a comma', async () => {
    show();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Less sugar' }));
    expect(box().value).toBe('less sugar');
    await u.click(screen.getByRole('button', { name: 'Gluten-free' }));
    expect(box().value).toBe('less sugar, gluten-free');
    for (const name of ['Vegetarian', 'Vegan', 'Quicker', 'Spicier']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('after a chip tap focus is in the textarea with the caret at the end', async () => {
    show({ seed: 'add walnuts' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Vegan' }));
    expect(document.activeElement).toBe(box());
    expect(box().value).toBe('add walnuts, vegan');
    expect(box().selectionStart).toBe(box().value.length);
  });

  it('the seed prefills the instruction, focuses it with the caret at the end, and Grow is ready', () => {
    show({ seed: 'less sugar, add walnuts' });
    expect(box().value).toBe('less sugar, add walnuts');
    expect(document.activeElement).toBe(box());
    expect(box().selectionStart).toBe(box().value.length);
    expect(grow().disabled).toBe(false);
  });

  it('on a touch device nothing is focused on open and a chip tap does not refocus the box', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true })) as never;
    try {
      show();
      expect(document.activeElement).not.toBe(box());
      await userEvent.setup().click(screen.getByRole('button', { name: 'Vegan' }));
      expect(box().value).toBe('vegan');
      expect(document.activeElement).not.toBe(box());
    } finally {
      // @ts-expect-error restore jsdom's absence of matchMedia
      delete window.matchMedia;
    }
  });

  it('Grow sends the trimmed instruction once, even on a double tap', async () => {
    const onGrow = vi.fn();
    show({ seed: '  less sugar  ', onGrow });
    const u = userEvent.setup();
    await u.dblClick(grow());
    expect(onGrow).toHaveBeenCalledTimes(1);
    expect(onGrow).toHaveBeenCalledWith('less sugar');
  });

  it('states the promise with the parent title, and falls back for a blank title and emoji', () => {
    const { unmount } = show();
    expect(
      screen.getByText(
        'Banana bread stays exactly as it is. Yours becomes a new version in its family, credited to you.'
      )
    ).toBeTruthy();
    unmount();
    show({ parent: makeRecipe({ title: '  ', emoji: '' }) });
    expect(
      screen.getByText(
        'This recipe stays exactly as it is. Yours becomes a new version in its family, credited to you.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Branching this recipe/ })).toBeTruthy();
  });

  it('the parent pill toggles the preview and exposes that state', async () => {
    show();
    const pill = screen.getByRole('button', { name: 'Branching Banana bread' });
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    const target = document.getElementById(pill.getAttribute('aria-controls') ?? '');
    expect(target?.hidden).toBe(true);
    await userEvent.setup().click(pill);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(target?.hidden).toBe(false);
    expect(target?.textContent).toContain('ripe bananas');
    expect(pill.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('GrowingCard', () => {
  it('shows the label but is hidden from assistive tech (the page live region announces it)', () => {
    const { container } = render(<GrowingCard />);
    expect(container.textContent).toBe('Growing your branch…');
    expect(screen.queryByRole('status')).toBeNull();
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });
});
