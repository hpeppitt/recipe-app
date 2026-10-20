// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AvatarEditor } from './AvatarEditor';

afterEach(cleanup);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

const SWATCH_NAMES = ['Peach', 'Apricot', 'Sage', 'Moss', 'Sand', 'Tangerine'];

function setup(over: Partial<React.ComponentProps<typeof AvatarEditor>> = {}) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <AvatarEditor
      open
      onClose={onClose}
      uid="u1"
      name="Test Cook"
      currentPhotoType="generated"
      currentPhotoEmoji={null}
      currentPhotoBgColor={null}
      currentPhotoURL={null}
      onSave={onSave}
      {...over}
    />
  );
  return { onSave, onClose, sheet: screen.getByRole('dialog', { name: 'Edit avatar' }) };
}

describe('AvatarEditor', () => {
  it('shows the swatches, the emoji grid and the footer in every mode', () => {
    const { sheet } = setup();
    for (const n of SWATCH_NAMES) expect(within(sheet).getByRole('button', { name: `Colour ${n}` })).toBeTruthy();
    expect(within(sheet).getAllByRole('button').filter((b) => /\p{Extended_Pictographic}/u.test(b.textContent ?? ''))).toHaveLength(15);
    expect(within(sheet).getByRole('button', { name: 'Use a photo' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Initials' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(sheet).queryByRole('radio')).toBeNull();
  });

  it('Cancel closes without saving', () => {
    const { sheet, onClose, onSave } = setup();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the chosen emoji and the colour token as an emoji avatar', async () => {
    const { sheet, onSave } = setup();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Colour Moss' }));
    fireEvent.click(within(sheet).getByRole('button', { name: '🍳' }));
    expect(within(sheet).getByRole('button', { name: 'Colour Moss' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(sheet).getByRole('button', { name: 'Colour Peach' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(sheet).getByRole('button', { name: '🍳' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ photoType: 'emoji', photoEmoji: '🍳', photoBgColor: 'var(--color-accent-2-300)', photoURL: null })
    );
  });

  it('saves Initials as the generated type', async () => {
    const { sheet, onSave } = setup({ currentPhotoType: 'emoji', currentPhotoEmoji: '🍜', currentPhotoBgColor: '#ffc6a5' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Initials' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ photoType: 'generated', photoEmoji: null, photoBgColor: null, photoURL: null })
    );
  });

  it('presses Peach for an avatar saved with the legacy hex', () => {
    const { sheet } = setup({ currentPhotoType: 'emoji', currentPhotoEmoji: '🍜', currentPhotoBgColor: '#ffe1d0' });
    expect(within(sheet).getByRole('button', { name: 'Colour Peach' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(sheet).getByRole('button', { name: 'Colour Apricot' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('presses no swatch for an avatar saved with an older colour', () => {
    const { sheet } = setup({ currentPhotoType: 'emoji', currentPhotoEmoji: '🍜', currentPhotoBgColor: '#EF4444' });
    for (const n of SWATCH_NAMES) {
      expect(within(sheet).getByRole('button', { name: `Colour ${n}` }).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('keeps Save disabled in Photo mode until there is an image, and saves an existing one as uploaded', async () => {
    const empty = setup({ currentPhotoType: 'uploaded' });
    expect((within(empty.sheet).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const url = 'data:image/jpeg;base64,AAAA';
    const { sheet, onSave } = setup({ currentPhotoType: 'uploaded', currentPhotoURL: url });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ photoType: 'uploaded', photoEmoji: null, photoBgColor: null, photoURL: url })
    );
  });

  it('stays open and shows an alert when saving fails', async () => {
    const onSave = vi.fn(async () => { throw new Error('offline'); });
    const { sheet, onClose } = setup({ onSave });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(await within(sheet).findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect((within(sheet).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders nothing while closed', () => {
    render(
      <AvatarEditor open={false} onClose={() => {}} uid="u1" name="T" currentPhotoType="generated"
        currentPhotoEmoji={null} currentPhotoBgColor={null} currentPhotoURL={null} onSave={async () => {}} />
    );
    expect(screen.queryByRole('button', { name: 'Initials', hidden: true })).toBeNull();
  });

  it('Escape (dialog cancel) and a backdrop click both call onClose', () => {
    const { sheet, onClose } = setup();
    fireEvent(sheet, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(sheet);
    fireEvent.click(sheet);
    expect(onClose).toHaveBeenCalledTimes(2);
    // A tap inside the panel is not a backdrop tap.
    const inside = within(sheet).getByRole('heading', { name: 'Edit avatar' });
    fireEvent.pointerDown(inside);
    fireEvent.click(inside);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('drops an unsaved draft when closed and reopened', () => {
    const props = {
      onClose: () => {}, uid: 'u1', name: 'T', currentPhotoType: 'emoji' as const, currentPhotoEmoji: '🍜',
      currentPhotoBgColor: '#ffc6a5', currentPhotoURL: null, onSave: async () => {},
    };
    const { rerender } = render(<AvatarEditor open {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '🍞' }));
    fireEvent.click(screen.getByRole('button', { name: 'Colour Sand' }));
    expect(screen.getByRole('button', { name: '🍞' }).getAttribute('aria-pressed')).toBe('true');
    rerender(<AvatarEditor open={false} {...props} />);
    rerender(<AvatarEditor open {...props} />);
    expect(screen.getByRole('button', { name: '🍞' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '🍜' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Colour Apricot' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Colour Sand' }).getAttribute('aria-pressed')).toBe('false');
  });
});
