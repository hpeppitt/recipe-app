// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';

const addAvoid = vi.fn();
const removeAvoid = vi.fn();
const hideTerm = vi.fn();
const unhideTerm = vi.fn();
let hook: Record<string, unknown>;
vi.mock('../hooks/useTasteProfile', async (orig) => ({ ...(await orig<object>()), useTasteProfile: () => hook }));
vi.mock('../hooks/useCooks', () => ({ useOwnCooks: () => ({ status: 'ready', cooks: [] }) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { TastePage } from './TastePage';
import { TasteAvoidError } from '../hooks/useTasteProfile';

const set = (extra: Record<string, unknown> = {}) => {
  hook = {
    avoids: ['Peanuts'], full: false, cookALot: ['Curry'], tendToChange: [], cookCount: 14, branchCount: 1, headline: 'Learned from 2 cooks.',
    loading: false, loadFailed: false, reload: vi.fn(), addAvoid, removeAvoid, hideTerm, unhideTerm, ...extra,
  };
};

beforeEach(() => {
  [addAvoid, removeAvoid, hideTerm, unhideTerm].forEach((f) => f.mockReset().mockResolvedValue(undefined));
  set();
});

describe('TastePage (RL-232)', () => {
  it('shows the three cards, the headline and Nothing yet', () => {
    renderWithProviders(<TastePage />);
    expect(screen.getByText('Learned from 2 cooks. Tap anything to correct it.')).toBeInTheDocument();
    expect(screen.getByText('From 14 cooks')).toBeInTheDocument();
    expect(screen.getByText('From 1 branch')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Always avoid' })).getByText('Peanuts')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'You cook a lot of' })).getByText('Curry')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'You tend to change' })).getByText('Nothing yet.')).toBeInTheDocument();
  });

  it('adds an avoid and shows the hook error inline', async () => {
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const field = screen.getByLabelText('Add something to avoid');
    fireEvent.change(field, { target: { value: 'Soy' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(addAvoid).toHaveBeenCalledWith('Soy'));
    await waitFor(() => expect(screen.queryByLabelText('Add something to avoid')).toBeNull());

    addAvoid.mockRejectedValue(new TasteAvoidError('duplicate'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.submit(screen.getByLabelText('Add something to avoid').closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('already on your list');
  });

  it('Escape cancels the field, clears it and returns focus to Add', () => {
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const field = screen.getByLabelText('Add something to avoid');
    fireEvent.change(field, { target: { value: 'Soy' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByLabelText('Add something to avoid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('Add something to avoid')).toHaveValue('');
  });

  it('locks the controls while a write is in flight', async () => {
    let release!: () => void;
    hideTerm.mockImplementation(() => new Promise<void>((r) => (release = r)));
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Curry' }));
    expect(screen.getByRole('button', { name: 'Remove Peanuts' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Curry' }));
    expect(hideTerm).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Peanuts' })).toBeEnabled());
  });

  it('removes an avoid', () => {
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Peanuts' }));
    expect(removeAvoid).toHaveBeenCalledWith('Peanuts');
  });

  it('offers Undo after removing an avoid, which adds it back', async () => {
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Peanuts' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(addAvoid).toHaveBeenCalledWith('Peanuts');
  });

  it('disables Add and says why when 12 are stored', () => {
    set({ full: true });
    renderWithProviders(<TastePage />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.getByText(/up to 12/)).toBeInTheDocument();
  });

  it('hides a learned term and undoes it', async () => {
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Curry' }));
    await waitFor(() => expect(hideTerm).toHaveBeenCalledWith('Curry'));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    expect(unhideTerm).toHaveBeenCalledWith('Curry');
  });

  it('offers Retry when the profile failed to load', () => {
    const reload = vi.fn();
    set({ loadFailed: true, reload });
    renderWithProviders(<TastePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalled();
  });
});
