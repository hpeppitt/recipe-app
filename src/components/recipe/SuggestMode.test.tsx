// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SuggestMode } from './SuggestMode';
import { makeRecipe } from '../../test/factories';
import { RateLimitedError } from '../../lib/errors';
import { MAX_MESSAGE, MAX_NOTE, MAX_WHY } from '../../lib/suggestion';
import type { Ingredient } from '../../types/recipe';

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

const ing = (name: string, amount: number | null, unit: string | null, group: string | null = null): Ingredient => ({
  amount, unit, name, notes: null, group,
});
const recipe = makeRecipe({
  id: 'r1',
  title: 'Soup',
  createdBy: { uid: 'owner', displayName: 'Ada Lovelace' },
  ingredients: [ing('garlic', 2, 'clove'), ing('salt', 1, 'tsp'), ing('pepper', null, null)],
});

function setup(over: { onSend?: (m: string) => Promise<void>; r?: typeof recipe } = {}) {
  const onSend = vi.fn(over.onSend ?? (() => Promise.resolve()));
  const onCancel = vi.fn();
  const onSent = vi.fn();
  render(<SuggestMode recipe={over.r ?? recipe} onSend={onSend} onCancel={onCancel} onSent={onSent} />);
  return { onSend, onCancel, onSent };
}
const row = (n: string) => screen.getByRole('button', { name: `Suggest a change to ${n}` });
const sendBtn = () => screen.getByRole('button', { name: /^Send to/ });
const edit = (n: string, v: string) => {
  fireEvent.click(row(n));
  fireEvent.change(within(screen.getByRole('group', { name: `Change ${n}` })).getByLabelText('New amount'), { target: { value: v } });
};

describe('SuggestMode', () => {
  it('shows the banner, title line and author-first send label', () => {
    setup();
    expect(screen.getByText('Tap any line to suggest a change')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Soup');
    expect(screen.getByText('by Ada Lovelace · 30 min · 2 servings')).toBeInTheDocument();
    expect(sendBtn().textContent).toBe('Send to Ada');
    expect(screen.getByText('Note for Ada Lovelace (optional)')).toBeInTheDocument();
  });

  it('falls back when the author has no name', () => {
    setup({ r: makeRecipe({ ...recipe, createdBy: { uid: 'o', displayName: null } }) });
    expect(sendBtn().textContent).toBe('Send to the author');
  });

  it('tap opens the editor prefilled, focuses the amount, and undo closes it and refocuses the row', () => {
    setup();
    expect(row('garlic').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row('garlic'));
    expect(row('garlic').getAttribute('aria-expanded')).toBe('true');
    const amount = screen.getByLabelText('New amount') as HTMLInputElement;
    expect(amount.value).toBe('2 clove');
    expect(document.activeElement).toBe(amount);
    fireEvent.click(screen.getByRole('button', { name: 'Undo this change' }));
    expect(screen.queryByLabelText('New amount')).toBeNull();
    expect(row('garlic').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(row('garlic'));
  });

  it('Escape closes the editor and returns focus to the row', () => {
    setup();
    fireEvent.click(row('salt'));
    fireEvent.keyDown(screen.getByLabelText('New amount'), { key: 'Escape' });
    expect(screen.queryByLabelText('New amount')).toBeNull();
    expect(document.activeElement).toBe(row('salt'));
  });

  it('several rows can be open at once, and an ingredient with no amount opens empty', () => {
    setup();
    fireEvent.click(row('garlic'));
    fireEvent.click(row('pepper'));
    const inputs = screen.getAllByLabelText('New amount') as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(['2 clove', '']);
  });

  it('counts changes, and an opened but unchanged row is not a change', () => {
    setup();
    expect(screen.getByText('Tap any line to change it')).toBeInTheDocument();
    fireEvent.click(row('garlic'));
    expect(screen.getByText('Tap any line to change it')).toBeInTheDocument();
    edit('garlic', '4 cloves');
    expect(screen.getByText('1 change').tagName).toBe('B');
    edit('salt', '2 tsp');
    expect(screen.getByText('2 changes').tagName).toBe('B');
  });

  it('keeps Send disabled until there is an edit or a note', () => {
    setup();
    expect(sendBtn()).toBeDisabled();
    fireEvent.click(row('garlic'));
    expect(sendBtn()).toBeDisabled();
    edit('garlic', '4 cloves');
    expect(sendBtn()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo this change' }));
    expect(sendBtn()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note for Ada Lovelace (optional)'), { target: { value: '  ' } });
    expect(sendBtn()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note for Ada Lovelace (optional)'), { target: { value: 'More heat' } });
    expect(sendBtn()).toBeEnabled();
  });

  it('sends the composed message once, even on a double click, then reports sent', async () => {
    let resolve!: () => void;
    const { onSend, onSent } = setup({ onSend: () => new Promise<void>((r) => { resolve = r; }) });
    edit('garlic', '4 cloves');
    fireEvent.change(within(screen.getByRole('group', { name: 'Change garlic' })).getByLabelText('Why?'), { target: { value: 'Love it' } });
    fireEvent.change(screen.getByLabelText('Note for Ada Lovelace (optional)'), { target: { value: 'Bake longer' } });
    fireEvent.click(sendBtn());
    fireEvent.click(sendBtn());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Change 2 clove garlic to 4 cloves. Love it\n\nBake longer');
    expect(onSent).not.toHaveBeenCalled();
    resolve();
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });

  it('keeps the edits and shows the existing message when the send fails', async () => {
    const { onSent } = setup({ onSend: () => Promise.reject(new Error('offline')) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    edit('garlic', '4 cloves');
    fireEvent.click(sendBtn());
    expect((await screen.findByRole('alert')).textContent).toBe("That didn't send. Check your connection and try again.");
    expect((screen.getByLabelText('New amount') as HTMLInputElement).value).toBe('4 cloves');
    expect(sendBtn()).toBeEnabled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('shows the rate-limit message', async () => {
    setup({ onSend: () => Promise.reject(new RateLimitedError('suggestion')) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    edit('garlic', '4 cloves');
    fireEvent.click(sendBtn());
    expect((await screen.findByRole('alert')).textContent).toBe("You've sent a lot of suggestions recently. Try again in a while.");
  });

  it('Cancel with nothing to send just leaves, no confirm', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Discard your suggestion?' })).toBeNull();
  });

  it('Cancel with edits asks first; Keep editing stays, Discard leaves', () => {
    const { onCancel } = setup();
    edit('garlic', '4 cloves');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
    const dlg = screen.getByRole('dialog', { name: 'Discard your suggestion?' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Keep editing' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect((screen.getByLabelText('New amount') as HTMLInputElement).value).toBe('4 cloves');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard your suggestion?' })).getByRole('button', { name: 'Discard' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('caps the why and the note inputs', () => {
    setup();
    fireEvent.click(row('garlic'));
    expect(screen.getByLabelText('Why?').getAttribute('maxlength')).toBe(String(MAX_WHY));
    expect(screen.getByLabelText('Note for Ada Lovelace (optional)').getAttribute('maxlength')).toBe(String(MAX_NOTE));
  });

  it('blocks Send with a visible reason when the composed message is too long, and sends again once shortened', () => {
    const { onSend } = setup();
    const note = screen.getByLabelText('Note for Ada Lovelace (optional)');
    fireEvent.change(note, { target: { value: 'x'.repeat(MAX_MESSAGE + 1) } });
    expect(sendBtn()).toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe(
      `Your suggestion is ${MAX_MESSAGE + 1} characters, over the ${MAX_MESSAGE} limit. Shorten it to send.`
    );
    fireEvent.click(sendBtn());
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(note, { target: { value: 'x'.repeat(MAX_MESSAGE) } });
    expect(sendBtn()).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disables Cancel while a send is in flight', async () => {
    let resolve!: () => void;
    const { onCancel } = setup({ onSend: () => new Promise<void>((r) => { resolve = r; }) });
    edit('garlic', '4 cloves');
    fireEvent.click(sendBtn());
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Discard your suggestion?' })).toBeNull();
    resolve();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
  });

  it('hints under an editor that has a why but no changed amount', () => {
    setup();
    const hint = 'Change the amount to include this suggestion, or put it in your note.';
    fireEvent.click(row('garlic'));
    expect(screen.queryByText(hint)).toBeNull();
    fireEvent.change(screen.getByLabelText('Why?'), { target: { value: 'Love it' } });
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New amount'), { target: { value: '' } });
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New amount'), { target: { value: '4 cloves' } });
    expect(screen.queryByText(hint)).toBeNull();
  });
});
