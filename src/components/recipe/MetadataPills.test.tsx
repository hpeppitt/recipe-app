// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { MetadataPills } from './MetadataPills';

const base = { prepTime: 10, cookTime: 20, totalTime: 30, difficulty: 'easy' };
const nutrition = { calories: 400, protein: 3.6, carbs: 34.2, fat: 0, fiber: 0, sugar: 0, sodium: 0 } as never;

describe('MetadataPills', () => {
  it('renders diet, kcal then macros in order with rounded text and aria-labels', () => {
    const { container } = renderWithProviders(<MetadataPills {...base} nutrition={nutrition} tags={['Vegetarian']} />);
    const text = Array.from(container.querySelectorAll('span')).map((s) => s.textContent);
    const order = ['Vegetarian', '400 kcal', '34 g carbs per serving', '0 g fat per serving', '4 g protein per serving'].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('34 g carbs per serving');
    expect(text).toContain('0 g fat per serving');
    expect(text).toContain('4 g protein per serving');
  });

  it('shows no macros without nutrition and no diet pill without a known tag', () => {
    renderWithProviders(<MetadataPills {...base} tags={['quick']} />);
    expect(screen.queryByText(/ g /)).toBeNull();
    expect(screen.queryByText('Vegetarian')).toBeNull();
  });

  it('skips a missing or non-numeric macro instead of rendering NaN', () => {
    const bad = { calories: 400, protein: 'x', carbs: undefined, fat: 5 } as never;
    const { container } = renderWithProviders(<MetadataPills {...base} nutrition={bad} />);
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).toContain('5 g fat');
    expect(container.textContent).not.toContain('carbs');
  });
});
