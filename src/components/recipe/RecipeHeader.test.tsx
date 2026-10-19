// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeRecipe } from '../../test/factories';
import { RecipeHeader } from './RecipeHeader';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

const original = makeRecipe({ id: 'r1', title: 'Banana bread', description: 'Moist.', emoji: '🍌' });
const branch = makeRecipe({ id: 'r2', title: 'Chocolate chunk', parentId: 'r1', depth: 1, emoji: '🍫' });

function show(recipe = original, familyRoot?: typeof original, over: Partial<Parameters<typeof RecipeHeader>[0]> = {}) {
  const props = {
    recipe, familyRoot, onBack: vi.fn(), showFavorite: true, isFavorite: false, onFavorite: vi.fn(),
    pendingCount: 0, isOwner: false, canSuggest: false, isSharing: false, shareDisabled: false,
    onShare: vi.fn(), onDelete: vi.fn(), onSuggest: vi.fn(), ...over,
  };
  renderWithProviders(<RecipeHeader {...props} />);
  return props;
}

describe('RecipeHeader original', () => {
  it('shows the title as the only h1, the description, and no family label', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Banana bread']);
    expect(screen.getByText('Moist.')).toBeInTheDocument();
    expect(screen.queryByText(/variation$/)).toBeNull();
  });

  it('shows Save off, then on with aria-pressed, and calls onFavorite once per click', () => {
    const props = show();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(save);
    expect(props.onFavorite).toHaveBeenCalledTimes(1);
  });

  it('shows Save pressed when favourited', () => {
    show(original, undefined, { isFavorite: true });
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('hides Save in local-only mode', () => {
    show(original, undefined, { showFavorite: false });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('RecipeHeader branch', () => {
  it('shows the family label from the root', () => {
    show(branch, original);
    expect(screen.getByText('🍌 Banana bread variation')).toBeInTheDocument();
  });

  it('shows no label before the ancestors load', () => {
    show(branch, undefined);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Chocolate chunk']);
    expect(screen.queryByText(/variation$/)).toBeNull();
  });

  it('shows Save in the floating variant too', () => {
    show(branch, original, { isFavorite: true });
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('omits the description', () => {
    show({ ...branch, description: 'Gooey.' }, original);
    expect(screen.queryByText('Gooey.')).toBeNull();
  });
});

describe('RecipeHeader menu sheet', () => {
  it('offers Delete and Edit only to the owner', () => {
    show(original, undefined, { isOwner: false });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Recipe options' }));
    expect(sheet.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(sheet.queryByRole('button', { name: 'Edit recipe' })).toBeNull();
  });

  it('runs the handler and closes the sheet', () => {
    const props = show(original, undefined, { isOwner: true });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Recipe options' })).toBeNull();
  });

  it('returns focus to the More button when dismissed with Escape', () => {
    show();
    const more = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(more);
    fireEvent(screen.getByRole('dialog', { name: 'Recipe options' }), new Event('cancel', { cancelable: true }));
    expect(more).toHaveFocus();
  });

  it('disables Copy share link while sharing', () => {
    show(original, undefined, { isSharing: true });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: 'Preparing link...' })).toBeDisabled();
  });

  it('omits Suggest a change when suggesting is not possible, and shows it when it is', () => {
    show(original, undefined, { canSuggest: false });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('button', { name: 'Suggest a change' })).toBeNull();
  });

  it('shows Suggest a change and runs its handler when suggesting is possible', () => {
    const props = show(original, undefined, { canSuggest: true });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }));
    expect(props.onSuggest).toHaveBeenCalledTimes(1);
  });

  it('enables Copy share link when not sharing', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('button', { name: 'Copy share link' })).toBeEnabled();
  });

  it('closes on a backdrop tap and focuses the More button', () => {
    show();
    const more = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(more);
    const dlg = screen.getByRole('dialog', { name: 'Recipe options' });
    fireEvent.pointerDown(dlg);
    fireEvent.click(dlg);
    expect(screen.queryByRole('dialog', { name: 'Recipe options' })).toBeNull();
    expect(more).toHaveFocus();
  });

  it('stays open when the tap lands on the panel, not the backdrop', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const dlg = screen.getByRole('dialog', { name: 'Recipe options' });
    const row = within(dlg).getByRole('button', { name: 'See the family' });
    fireEvent.pointerDown(row);
    fireEvent.click(dlg);
    expect(screen.getByRole('dialog', { name: 'Recipe options' })).toBeInTheDocument();
  });
});
