// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CookedSheet } from './CookedSheet';
import { RateLimitedError, TermsNotAcceptedError } from '../../lib/errors';
import { makeRecipe } from '../../test/factories';

const mocks = vi.hoisted(() => ({
  log: vi.fn(),
  navigate: vi.fn(),
  user: { uid: 'u1', displayName: 'Ann' } as unknown,
  addCookPhoto: vi.fn(),
  downscale: vi.fn(),
  reportError: vi.fn(),
  addLeftovers: vi.fn(),
  configured: true,
}));
vi.mock('../../hooks/useKitchen', () => ({ KITCHEN_BUSY_MESSAGE: 'busy', addLeftoversToPantry: mocks.addLeftovers }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, isConfigured: mocks.configured }) }));
vi.mock('../../services/telemetry', () => ({ reportError: mocks.reportError }));
vi.mock('../../services/firestore', () => ({ addCookPhoto: mocks.addCookPhoto }));
vi.mock('../../services/imageDownscale', () => ({ downscaleToJpeg: mocks.downscale }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<object>()), useNavigate: () => mocks.navigate }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  mocks.log.mockReset().mockResolvedValue('c1');
  mocks.navigate.mockReset();
  mocks.addCookPhoto.mockReset().mockResolvedValue(undefined);
  mocks.downscale.mockReset().mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD' });
  mocks.reportError.mockReset();
  mocks.addLeftovers.mockReset().mockResolvedValue(undefined);
  mocks.configured = true;
  mocks.user = { uid: 'u1', displayName: 'Ann', isAnonymous: false, emailVerified: true };
});
afterEach(cleanup);

const recipe = makeRecipe({ id: 'r1', title: 'Dal' });
const show = (props: Partial<React.ComponentProps<typeof CookedSheet>> = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <MemoryRouter>
      <CookedSheet open log={mocks.log} recipe={recipe} onClose={onClose} onSaved={onSaved} {...props} />
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
    expect(mocks.log).toHaveBeenCalledWith({ recipeId: 'r1', vote: 'tweak', note: 'less salt', user: mocks.user });
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

describe('CookedSheet photo', () => {
  const photoInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  const jpeg = new File(['x'], 'dinner.jpg', { type: 'image/jpeg' });
  const pickPhoto = (file = jpeg) => userEvent.upload(photoInput(), file);

  it('offers camera or library without forcing capture', () => {
    show();
    expect(photoInput().accept).toBe('image/*');
    expect(photoInput().hasAttribute('capture')).toBe(false);
    expect(screen.getByLabelText('Add a photo')).toBe(photoInput());
  });

  it('downscales to 800px within the 200000-character data URL, previews washed, and removes', async () => {
    show();
    await pickPhoto();
    const img = (await screen.findByRole('img')) as HTMLImageElement;
    expect(img.src).toBe('data:image/jpeg;base64,QUJD');
    expect(img.className).toContain('washed');
    expect(mocks.downscale).toHaveBeenCalledWith(jpeg, { maxSide: 800, maxBytes: 149_982, shrinkToFit: true });
    expect(img.alt).toBe('Your cook photo');
    expect(screen.getByLabelText(/Replace photo/)).toBe(photoInput());
    await waitFor(() => expect(document.activeElement).toBe(photoInput()));
    expect(screen.getByRole('button', { name: 'Remove photo' }).className).toContain('size-11');
    expect(screen.getByText(/Food only, please/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Food only, please/)).toBeNull();
  });

  it('says so when the photo cannot be decoded', async () => {
    mocks.downscale.mockRejectedValue(new Error('The photo could not be decoded'));
    show();
    await pickPhoto();
    expect((await screen.findByRole('alert')).textContent).toBe("That photo didn't work. Try another.");
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('refuses a type it does not accept before decoding', async () => {
    show();
    await userEvent.upload(photoInput(), new File(['x'], 'a.gif', { type: 'image/gif' }), { applyAccept: false });
    expect((await screen.findByRole('alert')).textContent).toBe('Use a JPEG, PNG or WebP photo.');
    expect(mocks.downscale).not.toHaveBeenCalled();
  });

  it('writes the cook, then the photo under its id', async () => {
    const order: string[] = [];
    mocks.log.mockImplementation(async () => (order.push('cook'), 'c1'));
    mocks.addCookPhoto.mockImplementation(async () => void order.push('photo'));
    const { onClose, onSaved } = show();
    await pickPhoto();
    await screen.findByRole('img');
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(order).toEqual(['cook', 'photo']);
    expect(mocks.addCookPhoto).toHaveBeenCalledWith('c1', 'r1', 'data:image/jpeg;base64,QUJD');
    expect(onSaved).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Saved to your cook log')).toBeTruthy();
  });

  it('keeps the cook when the photo write fails, and says the photo did not upload', async () => {
    const leak = 'data:image/jpeg;base64,' + 'QUJD'.repeat(100);
    mocks.downscale.mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD'.repeat(100) });
    mocks.addCookPhoto.mockRejectedValue(new Error(`denied ${leak}`));
    const { onClose, onSaved } = show();
    await pickPhoto();
    await screen.findByRole('img');
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith('c1');
    expect(screen.getByText("Saved to your cook log. The photo didn't upload.")).toBeTruthy();
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(String(mocks.reportError.mock.calls[0][0]))).not.toContain('QUJDQUJD');
  });

  it('makes no photo write without a photo', async () => {
    show();
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(mocks.log).toHaveBeenCalled());
    expect(mocks.addCookPhoto).not.toHaveBeenCalled();
  });

  it('announces preparing, blocks Save, and Remove cancels a photo still being prepared', async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.downscale.mockReturnValue(new Promise((r) => (finish = r)));
    show();
    await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
    await pickPhoto();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Preparing photo')).toBe(true);
    expect(saveBtn().disabled).toBe(true);
    expect(document.getElementById(saveBtn().getAttribute('aria-describedby') ?? '')?.textContent).toBe('Preparing photo');

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(saveBtn().disabled).toBe(false);
    finish({ mimeType: 'image/jpeg', base64: 'QUJD' });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each([
    ['a photo', false, 'Discard this photo?', "It won't be saved."],
    ['a note and a photo', true, 'Discard your note and photo?', 'Neither will be saved.'],
  ])('asks before discarding %s', async (_label, withNote, title, message) => {
    const { onClose } = show();
    if (withNote) await userEvent.type(note(), 'hi');
    await pickPhoto();
    await screen.findByRole('img');
    (document.querySelector('dialog') as HTMLDialogElement).dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('leftovers row', () => {
    const cook = async () => {
      await userEvent.click(screen.getByRole('radio', { name: 'Would make again' }));
      await userEvent.click(saveBtn());
    };

    it('is on by default and adds the leftovers after the cook and photo', async () => {
      const { onSaved } = show();
      await cook();
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(mocks.addLeftovers).toHaveBeenCalledWith('u1', 'Dal leftovers');
      expect(mocks.log.mock.invocationCallOrder[0]).toBeLessThan(mocks.addLeftovers.mock.invocationCallOrder[0]);
    });

    it('No thanks turns it off and Add them turns it back on', async () => {
      const { onSaved } = show();
      await userEvent.click(screen.getByRole('switch', { name: 'Add the leftovers to the pantry' }));
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText('Add them')).toBeTruthy();
      await cook();
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(mocks.addLeftovers).not.toHaveBeenCalled();
    });

    it('a pantry failure keeps the cook and is reported', async () => {
      mocks.addLeftovers.mockRejectedValue(new Error('nope'));
      const { onSaved } = show();
      await cook();
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith('c1'));
      expect(mocks.reportError).toHaveBeenCalledWith(expect.any(Error), 'cook-leftovers');
    });

    it('a busy kitchen skips quietly', async () => {
      mocks.addLeftovers.mockRejectedValue(new Error('busy'));
      const { onSaved } = show();
      await cook();
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(mocks.reportError).not.toHaveBeenCalled();
    });

    it('keeps the suffix on a 100 character title and skips an empty one', async () => {
      const { onSaved } = show({ recipe: makeRecipe({ id: 'r1', title: 'x'.repeat(100) }) });
      await cook();
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      const name = mocks.addLeftovers.mock.calls[0][1] as string;
      expect(name.endsWith(' leftovers')).toBe(true);
      expect(name.length).toBeLessThanOrEqual(80);
      cleanup();
      mocks.addLeftovers.mockClear();
      const second = show({ recipe: makeRecipe({ id: 'r1', title: '   ' }) });
      await cook();
      await waitFor(() => expect(second.onSaved).toHaveBeenCalled());
      expect(mocks.addLeftovers).not.toHaveBeenCalled();
    });

    it('is hidden when local-only or unverified', () => {
      mocks.configured = false;
      show();
      expect(screen.queryByText(/leftovers to the pantry/)).toBeNull();
      cleanup();
      mocks.configured = true;
      mocks.user = { uid: 'u1', isAnonymous: false, emailVerified: false };
      show();
      expect(screen.queryByText(/leftovers to the pantry/)).toBeNull();
    });
  });
});
