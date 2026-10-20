// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
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

// A state-driven swap keeps the same tree, unlike `rerender`, which drops the providers and remounts.
function Swap({ make }: { make: (id: string) => Recipe }) {
  const [id, setId] = useState('a');
  return (
    <>
      <button onClick={() => setId('b')}>next recipe</button>
      <RecipeContent recipe={make(id)} />
    </>
  );
}

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
    renderWithProviders(<Swap make={(id) => withIngredients({ id })} />);
    const honey = () => screen.getByRole('checkbox', { name: /honey, runny/ }) as HTMLInputElement;
    expect(honey().checked).toBe(false);
    await user.click(honey());
    expect(honey().checked).toBe(true);
    await user.keyboard(' ');
    // Focus is on the checkbox after a click, so Space untoggles it.
    expect(honey().checked).toBe(false);
    await user.click(honey());
    expect(honey().checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'next recipe' }));
    expect(honey().checked).toBe(false);
  });

  it('resets the scale when the recipe changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Swap make={(id) => withIngredients({ id })} />);
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText('Scaled ×1½ from 2.')).toBeTruthy();
    expect(screen.getByText('3 servings')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'next recipe' }));
    expect(screen.queryByText(/^Scaled ×/)).toBeNull();
    expect(screen.getByText('2 servings')).toBeTruthy();
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

describe('RecipeContent method and nutrition', () => {
  it('toggles a step checkbox from the keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RecipeContent
        recipe={withIngredients({ instructions: [{ step: 1, text: 'Whisk', group: null }] })}
      />
    );
    const step = screen.getByRole('checkbox', { name: 'Whisk' }) as HTMLInputElement;
    // Tab through the stepper and ingredient rows until the step is reached.
    for (let i = 0; i < 10 && document.activeElement !== step; i++) await user.tab();
    expect(document.activeElement).toBe(step);
    await user.keyboard(' ');
    expect(step.checked).toBe(true);
    await user.keyboard(' ');
    expect(step.checked).toBe(false);
  });

  it('ticks steps independently when two groups both number 1, 2', async () => {
    const user = userEvent.setup();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProviders(
      <RecipeContent
        recipe={withIngredients({
          instructions: [
            { step: 1, text: 'Mix dry', group: 'Dough' },
            { step: 2, text: 'Knead', group: 'Dough' },
            { step: 1, text: 'Simmer', group: 'Sauce' },
            { step: 2, text: 'Season', group: 'Sauce' },
          ],
        })}
      />
    );
    const box = (n: string) => screen.getByRole('checkbox', { name: n }) as HTMLInputElement;
    await user.click(box('Knead'));
    expect(box('Knead').checked).toBe(true);
    expect(box('Season').checked).toBe(false);
    expect(box('Mix dry').checked).toBe(false);
    expect(err.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    err.mockRestore();
  });


  const nutrition = { calories: 410, protein: 24, carbs: 30, fat: 12 };
  const steps = [
    { step: 1, text: 'Bake at 180°C for a long, long time indeed', group: null },
    { step: 2, text: 'Serve', group: null },
  ];
  const full = (patch: Partial<Recipe> = {}) => withIngredients({ nutrition, instructions: steps, ...patch });
  const headingNames = () =>
    screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

  it('orders ingredients, method, nutrition, notes', () => {
    renderWithProviders(<RecipeContent recipe={full({ notes: ['Keep warm'] })} />);
    const pos = (el: HTMLElement) => el.compareDocumentPosition.bind(el);
    const ing = screen.getByRole('heading', { name: 'Ingredients' });
    const method = screen.getByRole('heading', { name: 'Method' });
    const nut = screen.getByRole('button', { name: 'Nutrition per serving' });
    const notes = screen.getByRole('heading', { name: 'Notes' });
    expect(pos(ing)(method) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pos(method)(nut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pos(nut)(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headingNames()).not.toContain('Instructions');
  });

  it('has no nutrition card without nutrition', () => {
    renderWithProviders(<RecipeContent recipe={full({ nutrition: null })} />);
    expect(screen.queryByRole('button', { name: 'Nutrition per serving' })).toBeNull();
  });

  it('stays collapsed, keeps its figures when scaling, and collapses again on a new recipe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Swap make={(id) => full({ id })} />);
    const btn = () => screen.getByRole('button', { name: 'Nutrition per serving' });
    expect(btn().getAttribute('aria-expanded')).toBe('false');
    await user.click(btn());
    expect(screen.getByText('410')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText('Scaled ×1½ from 2.')).toBeTruthy();
    expect(screen.getByText('410')).toBeTruthy();
    expect(screen.getByText('24 g')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'next recipe' }));
    expect(btn().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('410')).toBeNull();
  });

  it('ticks a step by checkbox named by its text, with temperature conversion kept', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeContent recipe={full()} />);
    const serve = screen.getByRole('checkbox', { name: 'Serve' }) as HTMLInputElement;
    expect(serve.checked).toBe(false);
    await user.click(serve);
    expect(serve.checked).toBe(true);
    expect(serve.closest('label')!.lastElementChild!.className).toContain('line-through');
    const bake = screen.getByRole('checkbox', { name: /^Bake at 180°C|^Bake at 3\d\d°F/ }) as HTMLInputElement;
    expect(bake.checked).toBe(false);
    expect(bake.closest('label')!.lastElementChild!.className).not.toContain('line-through');
  });

  it('names a blank step by its number', () => {
    renderWithProviders(
      <RecipeContent recipe={full({ instructions: [{ step: 1, text: '', group: null }] })} />
    );
    expect(screen.getByRole('checkbox', { name: 'Step 1' })).toBeTruthy();
  });

  it('compact preview has plain steps, no ticks and no nutrition card', () => {
    renderWithProviders(<RecipeContent compact recipe={full()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Serve')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nutrition per serving' })).toBeNull();
  });

  it('chat card shows the same collapsed card after the method', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeCardMessage recipe={full()} />);
    const btn = screen.getByRole('button', { name: 'Nutrition per serving' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(
      screen.getByRole('heading', { name: 'Method' }).compareDocumentPosition(btn) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(btn);
    expect(screen.getByText('Calories')).toBeTruthy();
  });
});

describe('RecipeContent weigh spoons and liquids (RL-183)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows stored amounts by default', () => {
    renderWithProviders(<RecipeContent recipe={withIngredients()} />);
    expect(screen.getByText('1 tbsp')).toBeTruthy();
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it('shows ≈ grams with the original on the row, follows scaling, and leaves counts alone', async () => {
    store.set('recipe-lab-weigh-volumes', '1');
    const user = userEvent.setup();
    renderWithProviders(<RecipeContent recipe={withIngredients()} />);
    const honey = screen.getByText(/≈20 g/);
    expect(honey.getAttribute('title')).toBe('1 tbsp');
    expect(honey.textContent).toContain('(estimated from 1 tbsp)');
    expect(screen.getByRole('checkbox', { name: /eggs/ }).closest('label')!.textContent).toContain('2');
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    await user.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText(/≈40 g/).getAttribute('title')).toBe('2 tbsp');
  });
});
