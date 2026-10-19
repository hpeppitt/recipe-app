// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

afterEach(cleanup);

beforeAll(() => {
  // jsdom has no showModal/close; mirror the open attribute.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

function setup(dismissible = true) {
  const onClose = vi.fn();
  render(
    <Sheet open onClose={onClose} labelledBy="t" dismissible={dismissible}>
      <h2 id="t">Sheet title</h2>
      <button>Inside</button>
    </Sheet>
  );
  return { onClose, dialog: screen.getByRole('dialog') };
}

describe('Sheet', () => {
  it('renders children when open and names the dialog', () => {
    const { dialog } = setup();
    expect(dialog.getAttribute('aria-labelledby')).toBe('t');
    expect(screen.getByRole('dialog', { name: 'Sheet title' })).toBeTruthy();
  });

  it('closes on Escape when dismissible', () => {
    const { onClose, dialog } = setup();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('blocks Escape when not dismissible', () => {
    const { onClose, dialog } = setup(false);
    const ev = new Event('cancel', { cancelable: true });
    fireEvent(dialog, ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a backdrop click but not a click inside the panel', async () => {
    const { onClose, dialog } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores a backdrop click when not dismissible', async () => {
    const { onClose, dialog } = setup(false);
    await userEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reopens after a native close without cancel when not dismissible', () => {
    const { onClose, dialog } = setup(false);
    dialog.removeAttribute('open');
    fireEvent(dialog, new Event('close'));
    expect(dialog).toHaveAttribute('open');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a native close without cancel to the parent once when dismissible', () => {
    const { onClose, dialog } = setup();
    dialog.removeAttribute('open');
    fireEvent(dialog, new Event('close'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute('open');
  });

  it.each([true, false])('a close the parent asked for is a no-op (dismissible %s)', (dismissible) => {
    const onClose = vi.fn();
    const ui = (open: boolean) => (
      <Sheet open={open} onClose={onClose} labelledBy="t" dismissible={dismissible}>
        <h2 id="t">Sheet title</h2>
      </Sheet>
    );
    const { rerender } = render(ui(true));
    const dialog = document.querySelector('dialog')!;
    rerender(ui(false));
    fireEvent(dialog, new Event('close'));
    expect(dialog).not.toHaveAttribute('open');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sets aria-describedby only when given', () => {
    const { dialog } = setup();
    expect(dialog).not.toHaveAttribute('aria-describedby');
    cleanup();
    render(
      <Sheet open onClose={() => {}} labelledBy="t" describedBy="d">
        <h2 id="t">Sheet title</h2>
        <p id="d">What this is about</p>
      </Sheet>
    );
    expect(screen.getByRole('dialog', { name: 'Sheet title', description: 'What this is about' })).toBeTruthy();
  });
});
