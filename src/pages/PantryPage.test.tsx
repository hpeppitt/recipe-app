// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';

const addPantryItems = vi.fn();
const removePantry = vi.fn();
let hook: Record<string, unknown>;
vi.mock('../hooks/useKitchen', () => ({ useKitchen: () => hook }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
const readReceipt = vi.fn();
const downscaleToJpeg = vi.fn();
vi.mock('../services/gemini', () => ({ readReceipt: (...a: unknown[]) => readReceipt(...a) }));
vi.mock('../services/imageDownscale', () => ({ downscaleToJpeg: (...a: unknown[]) => downscaleToJpeg(...a) }));

import { PantryPage } from './PantryPage';

const item = (name: string, group: 'fresh' | 'cupboard') => ({ id: name, name, group, addedBy: 'u', addedAt: 1 });
const setPantry = (pantry: ReturnType<typeof item>[], extra: Record<string, unknown> = {}) => {
  hook = { kitchen: { shopping: [], pantry }, loading: false, error: null, members: [], addPantryItems, removePantry, ...extra };
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

  it('shows the household avatars in a pill, labelled with who shares it (RL-239)', () => {
    setPantry([], { members: [{ uid: 'test-user', name: 'Me', avatar: null }, { uid: 'ola', name: 'Ola', avatar: null }] });
    renderWithProviders(<PantryPage />);
    expect(screen.getByRole('img', { name: 'Shared with Ola' })).toBeInTheDocument();
  });
});

describe('PantryPage ageing and avatars (RL-240)', () => {
  const DAY = 86_400_000;
  const old = (name: string, days: number, addedBy = 'u') => ({ id: name, name, group: 'fresh' as const, addedBy, addedAt: Date.now() - days * DAY });
  const members = [{ uid: 'u', name: 'Ola', avatar: null }];

  it('labels the avatar with who added it and when, and "someone" for a former member', () => {
    setPantry([old('bananas', 8), old('milk', 1, 'gone')], { members });
    renderWithProviders(<PantryPage />);
    expect(screen.getByRole('img', { name: 'added by Ola 8 days ago' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'added by a former member 1 day ago' })).toBeInTheDocument();
  });

  it('tints old fresh items and shows the nudge with a safe link', () => {
    setPantry([old('bananas', 8), old('feta, aged', 9), old('kale', 2)], { members });
    renderWithProviders(<PantryPage />);
    expect(screen.getByText('bananas').closest('li')).toHaveClass('bg-accent-100');
    expect(screen.getByText('kale').closest('li')).not.toHaveClass('bg-accent-100');
    expect(screen.getByText(/Been in the pantry over a week: bananas and feta, aged\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find something to use them' })).toHaveAttribute('href', '/search?p=bananas%2Cfeta+aged');
  });

  it('shows no nudge when nothing is old, and dismiss hides it for the day', () => {
    setPantry([old('kale', 2)], { members });
    const { unmount } = renderWithProviders(<PantryPage />);
    expect(screen.queryByText('Find something to use them')).toBeNull();
    unmount();
    setPantry([old('bananas', 8)], { members });
    renderWithProviders(<PantryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss for today' }));
    expect(screen.queryByText('Find something to use them')).toBeNull();
  });
});

describe('PantryPage receipt (RL-241)', () => {
  const PHOTO = 'Z'.repeat(300);
  const file = () => new File(['x'], 'r.jpg', { type: 'image/jpeg' });
  const pick = (f: File) => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [f] } });
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  });
  beforeEach(() => {
    downscaleToJpeg.mockReset().mockResolvedValue({ mimeType: 'image/jpeg', base64: PHOTO });
    readReceipt.mockReset().mockResolvedValue(['Milk', 'Rice', 'Eggs']);
  });

  it('offers the camera with the receipt placeholder only to a verified cook', () => {
    renderWithProviders(<PantryPage />);
    expect(screen.getByLabelText('Add things')).toHaveAttribute('placeholder', 'Add or snap a receipt…');
    expect(screen.getByRole('button', { name: 'Snap a receipt' })).toBeInTheDocument();
  });

  it('reads the downscaled photo, confirms new items and adds them in one write with names only', async () => {
    renderWithProviders(<PantryPage />);
    pick(file());
    const dialog = await screen.findByRole('dialog', { name: 'From your receipt' });
    expect(downscaleToJpeg).toHaveBeenCalledWith(expect.any(File), { shrinkToFit: true });
    expect(readReceipt).toHaveBeenCalledWith({ mimeType: 'image/jpeg', base64: PHOTO });
    expect(within(dialog).queryByText('Rice')).toBeNull(); // already in the pantry
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 to the pantry' }));
    await waitFor(() => expect(addPantryItems).toHaveBeenCalledWith(['Milk', 'Eggs']));
    expect(addPantryItems).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(addPantryItems.mock.calls)).not.toContain(PHOTO);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Snap a receipt' })).toHaveFocus();
  });

  it('shows a failed add in the sheet only, clears it on retry, and focuses the camera on close', async () => {
    addPantryItems.mockRejectedValueOnce(new Error('x'));
    setPantry([item('rice', 'cupboard')], { error: 'Your list is full. Clear some lines first.' });
    renderWithProviders(<PantryPage />);
    pick(file());
    const dialog = await screen.findByRole('dialog', { name: 'From your receipt' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 to the pantry' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your list is full');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    let release!: () => void;
    addPantryItems.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 to the pantry' }));
    expect(within(dialog).queryByRole('alert')).toBeNull();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Snap a receipt' })).toHaveFocus();
  });

  it('ignores a second pick while one is being read', async () => {
    let finish!: (v: string[]) => void;
    readReceipt.mockImplementation(() => new Promise((r) => (finish = r)));
    renderWithProviders(<PantryPage />);
    pick(file());
    pick(file());
    await screen.findByRole('button', { name: 'Reading the receipt' });
    // The visible line (with the spinner) and the page's status line.
    expect(screen.getAllByText('Reading the receipt…')).toHaveLength(2);
    expect(downscaleToJpeg).toHaveBeenCalledTimes(1);
    finish(['Milk']);
    await screen.findByRole('dialog', { name: 'From your receipt' });
  });

  it('disables the camera while reading and while a kitchen write runs', async () => {
    let finish!: (v: string[]) => void;
    readReceipt.mockImplementation(() => new Promise((r) => (finish = r)));
    renderWithProviders(<PantryPage />);
    pick(file());
    const reading = await screen.findByRole('button', { name: 'Reading the receipt' });
    expect(reading).toHaveAttribute('aria-disabled', 'true');
    finish([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Snap a receipt' })).toHaveAttribute('aria-disabled', 'false'));

    let release!: () => void;
    removePantry.mockImplementation(() => new Promise<void>((r) => (release = r)));
    fireEvent.click(screen.getByRole('button', { name: 'Remove bananas' }));
    expect(screen.getByRole('button', { name: 'Snap a receipt' })).toBeDisabled();
    release();
  });

  it('shows the one message when the read fails', async () => {
    readReceipt.mockRejectedValue(new Error('x'));
    renderWithProviders(<PantryPage />);
    pick(file());
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read that receipt. Try a clearer photo.");
  });

  it('refuses a non-image file before downscaling', async () => {
    renderWithProviders(<PantryPage />);
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a JPEG, PNG or WebP photo.');
    expect(downscaleToJpeg).not.toHaveBeenCalled();
  });

  it('has no camera for an unverified user', () => {
    renderWithProviders(<PantryPage />, { user: { ...fakeUser, emailVerified: false } });
    expect(screen.queryByRole('button', { name: 'Snap a receipt' })).toBeNull();
  });
});
