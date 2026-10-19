// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { NutritionPanel } from './NutritionPanel';
import type { Nutrition } from '../../types/recipe';

const nutrition = { calories: 410.4, protein: 24.6, carbs: 30, fat: 12 };

describe('NutritionPanel', () => {
  it.each([[undefined], [null]])('renders nothing for %s', (n) => {
    const { container } = renderWithProviders(<NutritionPanel nutrition={n} />);
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is collapsed by default with the header button wired to the panel', () => {
    renderWithProviders(<NutritionPanel nutrition={nutrition} />);
    const btn = screen.getByRole('button', { name: 'Nutrition per serving' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const id = btn.getAttribute('aria-controls')!;
    expect(id).toBeTruthy();
    expect(document.getElementById(id)).toBeTruthy();
    expect(screen.queryByText('Calories')).toBeNull();
    expect(screen.queryByText(/Estimated from ingredients/)).toBeNull();
  });

  it('opens to four tiles with units and the note, and closes again by keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NutritionPanel nutrition={nutrition} />);
    const btn = screen.getByRole('button', { name: 'Nutrition per serving' });
    await user.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('410')).toBeTruthy();
    expect(screen.getByText('Calories')).toBeTruthy();
    expect(screen.getByText('25 g')).toBeTruthy();
    expect(screen.getByText('Protein')).toBeTruthy();
    expect(screen.getByText('30 g')).toBeTruthy();
    expect(screen.getByText('Carbs')).toBeTruthy();
    expect(screen.getByText('12 g')).toBeTruthy();
    expect(screen.getByText('Fat')).toBeTruthy();
    expect(screen.getByText('Estimated from ingredients. Changes with each branch.')).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Calories')).toBeNull();
  });

  it('shows a dash for a missing macro instead of NaN', async () => {
    const user = userEvent.setup();
    const partial = { calories: 200 } as unknown as Nutrition;
    renderWithProviders(<NutritionPanel nutrition={partial} />);
    await user.click(screen.getByRole('button', { name: 'Nutrition per serving' }));
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getAllByText('-')).toHaveLength(3);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
