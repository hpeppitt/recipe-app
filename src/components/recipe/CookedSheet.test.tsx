// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CookedSheet } from './CookedSheet';
import { RateLimitedError, TermsNotAcceptedError } from '../../lib/errors';
import { makeRecipe } from '../../test/factories';

const mocks = vi.hoisted(() => ({ log: vi.fn(), navigate: vi.fn(), user: { uid: 'u1', displayName: 'Ann' } as unknown }));
vi.mock('../../hooks/useCooks', () => ({ useRecipeCooks: () => ({ log: mocks.log }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<object>()), useNavigate: () => mocks.navigate }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  mocks.log.mockReset().mockResolvedValue('c1');
  mocks.navigate.mockReset();
  mocks.user = { uid: 'u1', displayName: 'Ann' };
});
afterEach(cleanup);

const recipe = makeRecipe({ id: 'r1' });
const show = (props: Partial<React.ComponentProps<typeof CookedSheet>> = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <MemoryRouter>
      <CookedSheet open recipe={recipe} onClose={onClose} onSaved={onSaved} {...props} />
    </MemoryRouter>
  );
  return { onClose, onSaved };
};
const saveBtn = () => screen.getByRole('button', { name: /Save to my cook log|Saving/ }) as HTMLButtonElement;
const note = () => screen.getByRole('textbox');

describe('CookedSheet', () => {
  it('needs a vote before saving', async () => {
    show();
    expect(saveBtn().disabled).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    expect(saveBtn().disabled).toBe(false);
  });

  it('logs the vote and trimmed note, closes and reports the id', async () => {
    const { onClose, onSaved } = show();
    await userEvent.click(screen.getByRole('radio', { name: 'Needs a tweak' }));
    await userEvent.type(note(), '  less salt ');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.log).toHaveBeenCalledWith({ recipeId: 'r1', vote: 'tweak', note: 'less salt', user: { uid: 'u1', displayName: 'Ann' } });
    expect(onSaved).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Saved to your cook log')).toBeTruthy();
  });

  it('sends a null note when empty', async () => {
    show();
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(mocks.log).toHaveBeenCalled());
    expect(mocks.log.mock.calls[0][0].note).toBeNull();
  });

  it('Grow saves first, then opens the composer with the prompt and cook id', async () => {
    const { onClose } = show();
    expect(screen.queryByRole('button', { name: 'Grow' })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Needs a tweak' }));
    await userEvent.type(note(), 'less salt');
    await userEvent.click(screen.getByRole('button', { name: 'Grow' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(mocks.log).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/recipe/r1/vary', { state: { suggestion: 'less salt', fromCookId: 'c1' } });
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    [new Error('offline'), "Couldn't save that. Check your connection and try again."],
    [new RateLimitedError('cook'), "You've logged a lot of cooks today. Try again tomorrow."],
    [new TermsNotAcceptedError(), 'Accept the updated Terms to log a cook. Reload the page to see them.'],
  ])('keeps the sheet and shows the failure copy', async (err, copy) => {
    mocks.log.mockRejectedValue(err);
    const { onClose } = show();
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await userEvent.click(saveBtn());
    expect((await screen.findByRole('alert')).textContent).toBe(copy);
    expect(onClose).not.toHaveBeenCalled();
    expect(saveBtn().disabled).toBe(false);
  });

  it('moves the vote with arrow keys', async () => {
    show();
    screen.getByRole('radio', { name: 'Would make again' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Needs a tweak' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Would make again' }).getAttribute('aria-checked')).toBe('true');
  });

  it('closes at once on Escape with no note, and asks first with one', async () => {
    const { onClose } = show();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();

    const second = show();
    await userEvent.type(note(), 'hi');
    (document.querySelector('dialog') as HTMLDialogElement).dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await screen.findByText('Discard this note?')).toBeTruthy();
    expect(second.onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(second.onClose).toHaveBeenCalled();
  });

  it('fills only the picked vote', async () => {
    show();
    const again = screen.getByRole('radio', { name: 'Would make again' });
    const tweak = screen.getByRole('radio', { name: 'Needs a tweak' });
    expect(again.className).not.toContain('bg-accent-2-700');
    expect(tweak.className).not.toContain('bg-accent-2-700');
    await userEvent.click(tweak);
    expect(tweak.className).toContain('bg-accent-2-700');
    expect(again.className).not.toContain('bg-accent-2-700');
  });

  it('disables Save and Grow without a user', async () => {
    mocks.user = null;
    show();
    await userEvent.click(screen.getByRole('radio', { name: 'Needs a tweak' }));
    await userEvent.type(note(), 'less salt');
    expect(saveBtn().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Grow' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears the failure when the vote or note changes', async () => {
    mocks.log.mockRejectedValue(new Error('offline'));
    show();
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await userEvent.click(saveBtn());
    await screen.findByRole('alert');
    await userEvent.type(note(), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(saveBtn());
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('radio', { name: 'Needs a tweak' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
