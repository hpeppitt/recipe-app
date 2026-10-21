// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';

const addPantryItems = vi.fn();
const removePantry = vi.fn();
let hook: Record<string, unknown>;
vi.mock('../hooks/useKitchen', () => ({ useKitchen: () => hook }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { PantryPage } from './PantryPage';

const item = (name: string, group: 'fresh' | 'cupboard') => ({ id: name, name, group, addedBy: 'u', addedAt: 1 });
const setPantry = (pantry: ReturnType<typeof item>[], extra: Record<string, unknown> = {}) => {
  hook = { kitchen: { shopping: [], pantry }, loading: false, error: null, addPantryItems, removePantry, ...extra };
};

beforeEach(() => {
  addPantryItems.mockReset().mockResolvedValue(undefined);
  removePantry.mockReset().mockResolvedValue(undefined);
  setPantry([item('bananas', 'fresh'), item('rice', 'cupboard'), item('feta, aged', 'fresh')]);
});

describe('PantryPage (RL-220)', () => {
  it('groups items as Fresh and Cupboard', () => {
    renderWithProviders(<PantryPage />);
    expect(within(screen.getByRole('region', { name: 'Fresh' })).getByText('bananas')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cupboard' })).getByText('rice')).toBeInTheDocument();
  });

  it('adds one item, then several comma separated in one call', async () => {
    renderWithProviders(<PantryPage />);
    const field = screen.getByLabelText('Add things');
    fireEvent.change(field, { target: { value: 'salt' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(addPantryItems).toHaveBeenCalledWith(['salt']));
    await waitFor(() => expect(field).toHaveValue(''));
    fireEvent.change(field, { target: { value: 'eggs, milk, ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addPantryItems).toHaveBeenLastCalledWith(['eggs', 'milk']));
    expect(addPantryItems).toHaveBeenCalledTimes(2);
  });

  it('splits on a typed comma, keeps the fragment, announces and refocuses', async () => {
    renderWithProviders(<PantryPage />);
    const field = screen.getByLabelText('Add things');
    fireEvent.change(field, { target: { value: 'eggs, Rice, mi' } });
    await waitFor(() => expect(addPantryItems).toHaveBeenCalledWith(['eggs', 'Rice']));
    await waitFor(() => expect(field).toHaveValue(' mi'));
    expect(screen.getByText('Added 1. Rice is already in your pantry.')).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('removes an item and locks the controls while it writes', async () => {
    let release!: () => void;
    removePantry.mockImplementation(() => new Promise<void>((r) => (release = r)));
    renderWithProviders(<PantryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove bananas' }));
    expect(removePantry).toHaveBeenCalledWith('bananas');
    expect(screen.getByRole('button', { name: 'Remove rice' })).toBeDisabled();
    expect(screen.getByLabelText('Add things')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove rice' })).not.toBeDisabled());
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Removed bananas');
  });

  it('keeps what was typed and shows the error when the write fails', async () => {
    addPantryItems.mockRejectedValue(new Error('x'));
    setPantry([item('rice', 'cupboard')], { error: 'Your list is full. Clear some lines first.', addPantryItems });
    renderWithProviders(<PantryPage />);
    fireEvent.change(screen.getByLabelText('Add things'), { target: { value: 'salt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByLabelText('Add things')).not.toHaveAttribute('readonly'));
    expect(screen.getByLabelText('Add things')).toHaveValue('salt');
    expect(screen.getByRole('alert')).toHaveTextContent('Your list is full');
  });

  it('links Cook from what\'s here to the pantry search with encoded names', () => {
    renderWithProviders(<PantryPage />);
    const href = screen.getByRole('link', { name: /Cook from what's here/ }).getAttribute('href')!;
    const p = new URLSearchParams(href.split('?')[1]).get('p');
    expect(href.startsWith('/search?p=')).toBe(true);
    expect(p).toBe('bananas,rice,feta aged');
  });

  it('shows the empty state with the field and a disabled Cook button', () => {
    setPantry([]);
    renderWithProviders(<PantryPage />);
    expect(screen.getByText('Your pantry is empty')).toBeInTheDocument();
    expect(screen.getByLabelText('Add things')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cook from what's here/ })).toBeDisabled();
  });

  it('shows a skeleton before the first snapshot', () => {
    hook = { kitchen: null, loading: true, error: null };
    renderWithProviders(<PantryPage />);
    expect(screen.getByRole('status', { name: 'Loading pantry' })).toBeInTheDocument();
  });
});
