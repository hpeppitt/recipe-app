// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
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

  it('shows the import source line for an imported original and a branch', () => {
    show(makeRecipe({ ...original, importedFrom: 'https://example.com/r' }));
    expect(screen.getByRole('link', { name: /Imported from example\.com/ })).toBeInTheDocument();
  });

  it('shows no import line without importedFrom', () => {
    show();
    expect(screen.queryByText(/Imported from/)).toBeNull();
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

describe('RecipeHeader New original tag (RL-162)', () => {
  it('shows New original on an original with a related family', () => {
    show({ ...original, relatedFamilyId: 'fam' });
    expect(screen.getByText('New original').textContent).toBe('New original, similar to an existing recipe family');
  });

  it('shows no tag without one', () => {
    show();
    expect(screen.queryByText(/New original/)).toBeNull();
  });

  it('shows no tag on a branch even if the field is set', () => {
    show({ ...branch, relatedFamilyId: 'fam' }, original);
    expect(screen.queryByText(/New original/)).toBeNull();
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

describe('RecipeHeader title clamp and compact bar (RL-129)', () => {
  const longTitle = 'A very long title '.repeat(6).trim();
  function mockObserver(isIntersecting: boolean) {
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) { cb([{ isIntersecting }]); }
      observe() {}
      disconnect() {}
    });
  }
  afterEach(() => vi.unstubAllGlobals());

  it('clamps the h1 to two lines but keeps the full text, on an original and a branch', () => {
    mockObserver(true);
    for (const r of [{ ...original, title: longTitle }, { ...branch, title: longTitle }]) {
      const { unmount } = renderWithProviders(<RecipeHeader {...{ recipe: r, onBack: vi.fn(), showFavorite: false, isFavorite: false, onFavorite: vi.fn(), pendingCount: 0, isOwner: false, canSuggest: false, isSharing: false, shareDisabled: false, onShare: vi.fn(), onDelete: vi.fn(), onSuggest: vi.fn() }} />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.className).toContain('line-clamp-2');
      expect(h1.textContent).toBe(longTitle);
      expect(h1.getAttribute('title')).toBe(longTitle);
      unmount();
    }
  });

  it('shows an aria-hidden bar with the full title once the h1 is out of view, and its back works', () => {
    mockObserver(false);
    const props = show({ ...original, title: longTitle });
    const bar = document.querySelector('[aria-hidden="true"].sticky') as HTMLElement;
    expect(bar.textContent).toBe(longTitle);
    const back = bar.querySelector('button') as HTMLButtonElement;
    expect(back.tabIndex).toBe(-1);
    fireEvent.click(back);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows no bar while the h1 is in view', () => {
    mockObserver(true);
    show();
    expect(document.querySelector('.sticky')).toBeNull();
  });
});

describe('RecipeHeader cook photo (RL-206)', () => {
  const photo = { cookId: 'c1', url: 'data:image/jpeg;base64,AAAA', name: 'Sam' };

  it('original: washed photo in the blob with the credit under the description', () => {
    show(original, undefined, { photo });
    const img = screen.getByRole('img', { name: 'Banana bread, cooked by Sam' });
    expect(img.tagName).toBe('IMG');
    expect(img.className).toContain('washed');
    expect(screen.getByText('Photo by Sam').className).toContain('text-neutral-700');
    expect(screen.queryByText('🍌')).toBeNull();
  });

  it('branch: washed cover photo in the hero with a credit chip', () => {
    show(branch, original, { photo });
    const img = screen.getByRole('img', { name: 'Chocolate chunk, cooked by Sam' });
    expect(img.className).toContain('washed');
    expect(img.className).toContain('object-cover');
    expect(screen.getByText('Photo by Sam')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });

  it('falls back to the emoji layout when the image fails to load', () => {
    show(original, undefined, { photo });
    fireEvent.error(screen.getByRole('img', { name: 'Banana bread, cooked by Sam' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Photo by/)).toBeNull();
    expect(screen.getByText('🍌')).toBeInTheDocument();
  });

  it('without a photo keeps the emoji layout', () => {
    show();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Photo by/)).toBeNull();
  });

  it('owner removes the photo after confirming; others do not see the row', async () => {
    const onRemovePhoto = vi.fn().mockResolvedValue(undefined);
    show(original, undefined, { photo, canRemovePhoto: true, onRemovePhoto });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.getByText("It came from Sam's cook.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await vi.waitFor(() => expect(onRemovePhoto).toHaveBeenCalledTimes(1));
  });

  it('shows a failure and keeps the dialog when removal fails', async () => {
    const onRemovePhoto = vi.fn().mockRejectedValue(new Error('denied'));
    show(original, undefined, { photo, canRemovePhoto: true, onRemovePhoto });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText("Couldn't remove the photo")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('someone who cannot remove has no Remove photo (not the owner, or unverified)', () => {
    show(original, undefined, { photo, isOwner: true, onRemovePhoto: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });
});
