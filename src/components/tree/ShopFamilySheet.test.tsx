// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeIngredient, makeRecipe } from '../../test/factories';

const getKitchenOnce = vi.fn();
const getOwnCooksInFamily = vi.fn();
vi.mock('../../services/firestore', () => ({
  getKitchenOnce: (...a: unknown[]) => getKitchenOnce(...a),
  getOwnCooksInFamily: (...a: unknown[]) => getOwnCooksInFamily(...a),
}));

const resolveKitchenId = vi.fn();
vi.mock('../../hooks/useKitchen', () => ({ resolveKitchenId: (...a: unknown[]) => resolveKitchenId(...a) }));

import { ShopFamilySheet } from './ShopFamilySheet';

const by = (name: string) => ({ uid: name, displayName: name });
const flour = { ...makeIngredient('flour'), amount: 200, unit: 'g' };
const sugar = { ...makeIngredient('sugar'), amount: 100, unit: 'g' };
const root = makeRecipe({ id: 'root', rootId: 'root', parentId: null, title: 'Banana Bread', servings: 8, ingredients: [flour, sugar], createdAt: 1, createdBy: by('Ada') });
const less = makeRecipe({ id: 'v1', rootId: 'root', parentId: 'root', title: 'Less sweet', servings: 8, ingredients: [flour, { ...sugar, amount: 50 }], createdAt: 2, createdBy: by('Bo') });
const recipes = [root, less];

function setup(currentId = 'v1') {
  const onAdd = vi.fn();
  render(<ShopFamilySheet open onClose={() => {}} recipes={recipes} currentId={currentId} uid="u1" adding={false} onAdd={onAdd} />);
  return onAdd;
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no dialog behaviour.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  getKitchenOnce.mockResolvedValue(null);
  resolveKitchenId.mockImplementation(async (uid: string) => uid);
  getOwnCooksInFamily.mockResolvedValue([]);
});

describe('ShopFamilySheet', () => {
  it('selects the current version and shows each change against the original', () => {
    setup();
    expect((screen.getByRole('radio', { name: /Less sweet/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Banana Bread/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByText('-50 g sugar').length).toBeGreaterThan(0);
    expect(screen.getByText('The original · Ada')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Which banana bread are you shopping for?' })).toBeTruthy();
  });

  it('tags a version the user made', async () => {
    getOwnCooksInFamily.mockResolvedValue([{ recipeId: 'v1' }]);
    setup();
    expect(await screen.findByText('Bo · you made this')).toBeTruthy();
    expect(getOwnCooksInFamily).toHaveBeenCalledWith('u1', 'root');
  });

  it("reads the pantry of the household the user belongs to, not their own unused kitchen (RL-238)", async () => {
    resolveKitchenId.mockResolvedValue('owner1');
    setup();
    await waitFor(() => expect(getKitchenOnce).toHaveBeenCalledWith('owner1'));
    expect(resolveKitchenId).toHaveBeenCalledWith('u1');
  });

  it('the count leaves out pantry lines', async () => {
    getKitchenOnce.mockResolvedValue({ pantry: [{ id: 'p', name: 'Sugar', group: 'cupboard', addedBy: 'u1', addedAt: 1 }] });
    setup();
    expect(await screen.findByRole('button', { name: 'Add 1 thing to the list' })).toBeTruthy();
  });

  it('adds the chosen version at the stepped servings', async () => {
    const onAdd = setup();
    await screen.findByRole('button', { name: /^Add 2 things/ });
    fireEvent.click(screen.getByRole('radio', { name: /Banana Bread/ }));
    fireEvent.click(screen.getByRole('button', { name: 'One more serving' }));
    expect(screen.getByText('9 servings')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Add 2 things/ }));
    expect(onAdd).toHaveBeenCalledWith(root, 9);
  });

  it('promises no number until the pantry has loaded, then disables Add at 0', async () => {
    getKitchenOnce.mockResolvedValue({ pantry: ['flour', 'sugar'].map((name) => ({ id: name, name, group: 'cupboard', addedBy: 'u1', addedAt: 1 })) });
    setup();
    expect(screen.getByRole('button', { name: 'Add to the list' })).toBeTruthy();
    const add = (await screen.findByRole('button', { name: 'Add 0 things to the list' })) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText('Everything is already in your pantry')).toBeTruthy();
  });

  it('is one tab stop: one radio group name, and the selected radio holds focus', async () => {
    setup();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    await waitFor(() => expect(document.activeElement).toBe(radios[1]));
  });

  it('shows a failed add inside the sheet', () => {
    render(<ShopFamilySheet open onClose={() => {}} recipes={recipes} currentId="v1" uid="u1" adding={false} error="Your list is full." onAdd={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Your list is full.');
  });

  it('disables Add while writing', () => {
    render(<ShopFamilySheet open onClose={() => {}} recipes={recipes} currentId="v1" uid="u1" adding onAdd={vi.fn()} />);
    expect((screen.getByRole('button', { name: /^Add/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists at most 30 versions and keeps the current one', async () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      makeRecipe({ id: `m${i}`, rootId: 'root', parentId: i ? 'm0' : null, title: `V${i}`, createdAt: i + 1, ingredients: [flour] })
    );
    render(<ShopFamilySheet open onClose={() => {}} recipes={many} currentId="m34" uid="u1" adding={false} onAdd={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(30);
    expect((screen.getByRole('radio', { name: /V34/ }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(getKitchenOnce).toHaveBeenCalled());
  });
});
