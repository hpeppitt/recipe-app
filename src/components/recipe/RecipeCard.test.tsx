// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RecipeCard } from './RecipeCard';
import { makeRecipe } from '../../test/factories';

describe('RecipeCard', () => {
  it('renders the title and emoji', () => {
    renderWithProviders(<RecipeCard recipe={makeRecipe({ title: 'Shakshuka', emoji: '🍅' })} />);
    expect(screen.getByRole('heading', { name: 'Shakshuka' })).toBeInTheDocument();
    expect(screen.getByText('🍅')).toBeInTheDocument();
  });
});
