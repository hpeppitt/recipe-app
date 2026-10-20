// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

afterEach(cleanup);

const props = { open: true, title: 'T', message: 'M', onConfirm: vi.fn(), onCancel: vi.fn() };
const escape = () => {
  const e = new Event('cancel', { cancelable: true });
  screen.getByRole('dialog', { hidden: true }).dispatchEvent(e);
  return e.defaultPrevented;
};

describe('ConfirmDialog', () => {
  it('Esc cannot close it while busy (RL-159)', () => {
    render(<ConfirmDialog {...props} busy />);
    expect(escape()).toBe(true);
  });

  it('Esc closes it when not busy', () => {
    render(<ConfirmDialog {...props} />);
    expect(escape()).toBe(false);
  });

  it('hideCancel leaves one button', () => {
    render(<ConfirmDialog {...props} hideCancel confirmLabel="OK" />);
    expect(screen.getAllByRole('button', { hidden: true }).map((b) => b.textContent)).toEqual(['OK']);
  });
});
