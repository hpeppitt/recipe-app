// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeRecipe } from '../../test/factories';
import { RecipeContent } from './RecipeContent';
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
