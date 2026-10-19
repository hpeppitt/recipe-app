// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeRecipe } from '../../test/factories';
import { RecipeContent } from './RecipeContent';
import { RecipeCardMessage } from '../chat/RecipeCardMessage';
import userEvent from '@testing-library/user-event';
import type { Recipe } from '../../types/recipe';

const malformed = (patch: Record<string, unknown>) =>
  ({ ...makeRecipe(), ...patch }) as unknown as Recipe;

describe('RecipeContent with malformed documents', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['not an array', 'two eggs'],
  ])('renders with ingredients and instructions %s', (_label, bad) => {
    renderWithProviders(
      <RecipeContent recipe={malformed({ ingredients: bad, instructions: bad })} />
    );
    expect(screen.getByRole('heading', { name: makeRecipe().title })).toBeTruthy();
    expect(screen.getByText(/no ingredients to show/)).toBeTruthy();
    expect(screen.getByText(/no instructions to show/)).toBeTruthy();
  });

  it('still shows the section that is intact', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    renderWithProviders(<RecipeContent recipe={malformed({ instructions: undefined })} />);
    expect(screen.queryByText(/no ingredients to show/)).toBeNull();
    expect(screen.getByText(/no instructions to show/)).toBeTruthy();
  });
});

const withIngredients = (patch: Partial<Recipe> = {}) =>
  makeRecipe({
    servings: 2,
    ingredients: [
      { amount: 1, unit: 'tbsp', name: 'honey', notes: 'runny', group: null },
      { amount: 2, unit: null, name: 'eggs', notes: null, group: null },
    ],
    ...patch,
  });

describe('RecipeContent servings and ticks', () => {
  it('shows no Scaled strip or Reset at the stored count, and scales then resets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeContent recipe={withIngredients()} />);
    expect(screen.queryByText(/^Scaled ×/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    expect(screen.getByText('2 servings')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText('4 servings')).toBeTruthy();
    expect(screen.getByText('Scaled ×2 from 2.')).toBeTruthy();
    // Counts double, and the scaled amount is terracotta.
    const eggAmount = () => screen.getByRole('checkbox', { name: /eggs/ }).closest('label')!.querySelector('span:nth-of-type(2)')!;
    expect(eggAmount().textContent).toBe('4');
    expect(eggAmount().className).toContain('text-accent-700');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('2 servings')).toBeTruthy();
    expect(screen.queryByText(/^Scaled ×/)).toBeNull();
    expect(eggAmount().textContent).toBe('2');
    expect(eggAmount().className).not.toContain('text-accent-700');
  });

  it('keeps the stepper within 1 to 99', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeContent recipe={withIngredients({ servings: 1 })} />);
    expect((screen.getByRole('button', { name: 'One fewer serving' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('1 serving')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText('2 servings')).toBeTruthy();
  });

  it('ticks a row by checkbox name and not persisted across recipes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<RecipeContent recipe={withIngredients({ id: 'a' })} />);
    const box = screen.getByRole('checkbox', { name: /honey, runny/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(box.checked).toBe(true);
    await user.keyboard(' ');
    // Focus is on the checkbox after a click, so Space untoggles it.
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(box.checked).toBe(true);
    rerender(<RecipeContent recipe={withIngredients({ id: 'b' })} />);
    expect((screen.getByRole('checkbox', { name: /honey, runny/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('resets the scale when the recipe changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<RecipeContent recipe={withIngredients({ id: 'a' })} />);
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText('Scaled ×1½ from 2.')).toBeTruthy();
    rerender(<RecipeContent recipe={withIngredients({ id: 'b' })} />);
    expect(screen.queryByText(/^Scaled ×/)).toBeNull();
  });

  it('compact preview has no stepper, no ticks and no author pill but keeps servings', () => {
    renderWithProviders(
      <RecipeContent compact recipe={withIngredients({ createdBy: { uid: 'u1', displayName: 'Ana' } })} />
    );
    expect(screen.queryByRole('button', { name: 'One more serving' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Open author/ })).toBeNull();
    expect(screen.getByText('2 servings')).toBeTruthy();
  });
});

describe('RecipeContent pills', () => {
  it('links the author to their profile and shows kcal only with nutrition', () => {
    const nutrition = { calories: 410, protein: 1, carbs: 1, fat: 1 };
    renderWithProviders(
      <RecipeContent recipe={withIngredients({ createdBy: { uid: 'u1', displayName: 'Ana' }, nutrition })} />
    );
    const link = screen.getByRole('link', { name: 'Open author, Ana' });
    expect(link.getAttribute('href')).toBe('/profile/u1');
    expect(link.getAttribute('aria-label')).toBe('Open author, Ana');
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('410 kcal')).toBeTruthy();
  });

  it('has no kcal pill without nutrition and no author link for a local author', () => {
    renderWithProviders(<RecipeContent recipe={withIngredients()} />);
    expect(screen.queryByText(/kcal/)).toBeNull();
    expect(screen.queryByRole('link', { name: /^Open author/ })).toBeNull();
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('Prep 10 min')).toBeTruthy();
  });
});

describe('RecipeCardMessage', () => {
  it('shows servings as a pill, no author pill and no stepper', () => {
    const r = withIngredients({ createdBy: { uid: 'u1', displayName: 'Ana' } });
    renderWithProviders(<RecipeCardMessage recipe={r} />);
    expect(screen.getByText('2 servings')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Open author/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'One more serving' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('RecipeContent edge cases', () => {
  it('has no stepper when ingredients are missing', () => {
    renderWithProviders(<RecipeContent recipe={malformed({ ingredients: undefined })} />);
    expect(screen.queryByRole('button', { name: 'One more serving' })).toBeNull();
  });

  it.each([['local'], ['']])('has no author link for uid %j', (uid) => {
    renderWithProviders(<RecipeContent recipe={withIngredients({ createdBy: { uid, displayName: 'Ana' } })} />);
    expect(screen.queryByRole('link', { name: /^Open author/ })).toBeNull();
  });

  it('names a blank author Anonymous', () => {
    renderWithProviders(<RecipeContent recipe={withIngredients({ createdBy: { uid: 'u2', displayName: '' } })} />);
    expect(screen.getByRole('link', { name: 'Open author, Anonymous' })).toBeTruthy();
  });

  it('strikes the name of a ticked row only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeContent recipe={withIngredients()} />);
    const nameOf = (re: RegExp) => screen.getByRole('checkbox', { name: re }).closest('label')!.lastElementChild!;
    expect(nameOf(/honey/).className).not.toContain('line-through');
    await user.click(screen.getByRole('checkbox', { name: /honey/ }));
    expect(nameOf(/honey/).className).toContain('line-through');
    expect(nameOf(/eggs/).className).not.toContain('line-through');
  });

  it('pluralizes the servings pill', () => {
    renderWithProviders(<RecipeContent compact recipe={withIngredients({ servings: 1 })} />);
    expect(screen.getByText('1 serving')).toBeTruthy();
    expect(screen.queryByText('1 servings')).toBeNull();
  });
});
