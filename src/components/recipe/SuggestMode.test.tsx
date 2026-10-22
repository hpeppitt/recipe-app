// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SuggestMode } from './SuggestMode';
import { makeRecipe } from '../../test/factories';
import { RateLimitedError } from '../../lib/errors';
import { MAX_EDIT_FROM, MAX_EDITS, MAX_MESSAGE, MAX_NOTE, MAX_WHY } from '../../lib/suggestion';
import type { Ingredient } from '../../types/recipe';
import type { SuggestionEdit } from '../../types/social';

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
  instructions: [
    { step: 1, text: 'Chop the garlic.', group: null },
    { step: 2, text: 'Simmer for 20 minutes.', group: null },
  ],
});

function setup(over: { onSend?: (s: { message: string; edits: SuggestionEdit[] }) => Promise<void>; r?: typeof recipe } = {}) {
  const onSend = vi.fn(over.onSend ?? (() => Promise.resolve()));
  const onCancel = vi.fn();
  const onSent = vi.fn();
  render(<SuggestMode recipe={over.r ?? recipe} onSend={onSend} onCancel={onCancel} onSent={onSent} />);
  return { onSend, onCancel, onSent };
}
// hidden: true skips the per-node visibility walk, the slow part of getByRole under load; nothing here is hidden.
const row = (n: string) => screen.getByRole('button', { name: new RegExp(`^Suggest a change to (.* )?${n}$`), hidden: true });
const stepRow = (n: number) => screen.getByRole('button', { name: new RegExp(`^Suggest a change to step ${n}: `) });
const writeNote = (v: string) => {
  fireEvent.click(screen.getByRole('button', { name: /^General note/ }));
  fireEvent.change(screen.getByLabelText('General note text'), { target: { value: v } });
};
const sendBtn = () => screen.getByRole('button', { name: /^Send to/ });
const edit = (n: string, v: string) => {
  fireEvent.click(row(n));
  fireEvent.change(within(screen.getByRole('group', { name: `Change ${n}`, hidden: true })).getByLabelText('New amount'), { target: { value: v } });
};

describe('SuggestMode', () => {
  it('always shows stored amounts, even with weigh spoons and liquids on (RL-183)', () => {
    vi.stubGlobal('localStorage', { getItem: () => '1', setItem: () => {}, removeItem: () => {} });
    try {
      setup();
      expect(screen.queryByText(/≈/)).toBeNull();
      expect(row('salt').textContent).toContain('tsp');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the banner, title line and author-first send label', () => {
    setup();
    expect(screen.getByText('Tap any line to suggest a change')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Soup');
    expect(screen.getByText('by Ada Lovelace · 30 min · 2 servings')).toBeInTheDocument();
    expect(sendBtn().textContent).toBe('Send to Ada');
    expect(screen.getByRole('heading', { name: 'Method' })).toBeInTheDocument();
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

  it('Escape leaves a card with typed text open; the X still undoes it', () => {
    setup();
    edit('garlic', '4 cloves');
    fireEvent.keyDown(screen.getByLabelText('New amount'), { key: 'Escape' });
    expect(screen.getByLabelText('New amount')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo this change' }));
    expect(screen.queryByLabelText('New amount')).toBeNull();
  });

  it('names rows by what they show', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Suggest a change to 2 clove garlic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest a change to pepper' })).toBeInTheDocument();
    expect(stepRow(1).getAttribute('aria-label')).toBe('Suggest a change to step 1: Chop the garlic.');
  });

  it('blocks Send with a reason for a step too long to suggest on', () => {
    const long = 'x'.repeat(MAX_EDIT_FROM + 1);
    setup({ r: makeRecipe({ ...recipe, instructions: [{ step: 1, text: long, group: null }] }) });
    fireEvent.click(stepRow(1));
    fireEvent.change(screen.getByLabelText('New step text'), { target: { value: 'Short' } });
    expect(screen.getByRole('alert').textContent).toBe('This step is too long to suggest on');
    expect(sendBtn()).toBeDisabled();
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
    writeNote('  ');
    expect(sendBtn()).toBeDisabled();
    writeNote('More heat');
    expect(sendBtn()).toBeEnabled();
  });

  it('sends the composed message once, even on a double click, then reports sent', async () => {
    let resolve!: () => void;
    const { onSend, onSent } = setup({ onSend: () => new Promise<void>((r) => { resolve = r; }) });
    edit('garlic', '4 cloves');
    fireEvent.change(within(screen.getByRole('group', { name: 'Change garlic' })).getByLabelText('Why?'), { target: { value: 'Love it' } });
    writeNote('Bake longer');
    fireEvent.click(sendBtn());
    fireEvent.click(sendBtn());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({
      message: 'Change 2 clove garlic to 4 cloves. Love it\n\nBake longer',
      edits: [
        { kind: 'ingredient', index: 0, name: 'garlic', from: '2 clove', to: '4 cloves', why: 'Love it' },
        { kind: 'general', from: '', to: 'Bake longer' },
      ],
    });
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
    fireEvent.click(screen.getByRole('button', { name: /^General note/ }));
    expect(screen.getByLabelText('General note text').getAttribute('maxlength')).toBe(String(MAX_NOTE));
  });

  it('blocks Send with a visible reason when the composed message is too long, and sends again once shortened', () => {
    const { onSend } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^General note/ }));
    const note = screen.getByLabelText('General note text');
    fireEvent.change(note, { target: { value: 'x'.repeat(MAX_MESSAGE + 1) } });
    expect(sendBtn()).toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe(
      `Your suggestion is ${MAX_MESSAGE + 1} characters, over the ${MAX_MESSAGE} limit. Shorten it to send.`
    );
    fireEvent.click(sendBtn());
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(note, { target: { value: 'x'.repeat(MAX_MESSAGE) } });
    expect(sendBtn()).toBeEnabled();
    expect(screen.getByRole('status').textContent).toBe('');
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
    const hint = 'Change the amount to include this suggestion, or put it in a general note.';
    fireEvent.click(row('garlic'));
    expect(screen.queryByText(hint)).toBeNull();
    fireEvent.change(screen.getByLabelText('Why?'), { target: { value: 'Love it' } });
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New amount'), { target: { value: '' } });
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New amount'), { target: { value: '4 cloves' } });
    expect(screen.queryByText(hint)).toBeNull();
  });

  it('a step edit opens prefilled, counts, sends from and to, and Escape returns focus to the row', () => {
    const { onSend } = setup();
    fireEvent.click(stepRow(2));
    const text = screen.getByLabelText('New step text') as HTMLTextAreaElement;
    expect(text.value).toBe('Simmer for 20 minutes.');
    expect(text.getAttribute('maxlength')).toBe('1000');
    expect(document.activeElement).toBe(text);
    fireEvent.keyDown(text, { key: 'Escape' });
    expect(document.activeElement).toBe(stepRow(2));
    fireEvent.click(stepRow(2));
    fireEvent.change(screen.getByLabelText('New step text'), { target: { value: 'Simmer for 30 minutes' } });
    fireEvent.change(screen.getByLabelText('Why?'), { target: { value: 'Thicker' } });
    expect(screen.getByText('1 change').tagName).toBe('B');
    fireEvent.click(sendBtn());
    expect(onSend).toHaveBeenCalledWith({
      message: 'Change step 2 to: Simmer for 30 minutes. Thicker',
      edits: [{ kind: 'step', index: 1, from: 'Simmer for 20 minutes.', to: 'Simmer for 30 minutes', why: 'Thicker' }],
    });
  });

  it('the general note row shows the first line and counts as a change', () => {
    setup();
    writeNote('Needs heat\nand salt');
    expect(screen.getByText('1 change')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'General note Needs heat' }).textContent).toBe('General note Needs heat');
    fireEvent.click(screen.getByRole('button', { name: 'Undo this change' }));
    expect(screen.queryByLabelText('General note text')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^General note/ }));
  });

  it('an amount that does not parse shows the help, blocks Send and is not counted', () => {
    setup();
    edit('salt', 'lots');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sendBtn()).toBeDisabled();
    fireEvent.blur(screen.getByLabelText('New amount'));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Use a number, and a unit if it has one, like 80 g');
    expect(screen.getByLabelText('New amount').getAttribute('aria-describedby')).toBe(alert.id);
    expect(screen.getByText('Tap any line to change it')).toBeInTheDocument();
    writeNote('Fine');
    expect(sendBtn()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New amount'), { target: { value: '80 g' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sendBtn()).toBeEnabled();
  });

  it('drops unchanged and blank edits from what is sent', () => {
    const { onSend } = setup();
    fireEvent.click(row('garlic'));
    edit('salt', '  ');
    fireEvent.click(stepRow(1));
    edit('pepper', '2 tsp');
    fireEvent.click(sendBtn());
    expect(onSend).toHaveBeenCalledWith({
      message: 'Change pepper to 2 tsp.',
      edits: [{ kind: 'ingredient', index: 2, name: 'pepper', from: '', to: '2 tsp' }],
    });
  });

  it('blocks Send past the edit cap', () => {
    setup({ r: makeRecipe({ ...recipe, ingredients: Array.from({ length: MAX_EDITS + 1 }, (_, i) => ing(`item${i}`, 1, 'g')) }) });
    for (let i = 0; i <= MAX_EDITS; i++) edit(`item${i}`, '2 g');
    expect(sendBtn()).toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe(`A suggestion can hold ${MAX_EDITS} changes. Undo 1 to send.`);
  });
});
