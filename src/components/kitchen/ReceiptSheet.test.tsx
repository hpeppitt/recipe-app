// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReceiptSheet } from './ReceiptSheet';

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

describe('ReceiptSheet (RL-241)', () => {
  it('lists every item ticked and adds only the ticked ones', () => {
    const onAdd = vi.fn();
    render(<ReceiptSheet items={['Milk', 'Eggs', 'Bread']} onClose={() => {}} onAdd={onAdd} busy={false} />);
    expect(screen.getByRole('dialog', { name: 'From your receipt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Milk' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Eggs' }));
    expect(screen.getByRole('button', { name: 'Eggs' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('2 of 3 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to the pantry' }));
    expect(onAdd).toHaveBeenCalledWith(['Milk', 'Bread']);
  });

  it('disables Add with nothing ticked or while a write runs, and shows an error', () => {
    const { rerender } = render(<ReceiptSheet items={['Milk']} onClose={() => {}} onAdd={() => {}} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Milk' }));
    expect(screen.getByRole('button', { name: 'Select items to add' })).toBeDisabled();
    rerender(<ReceiptSheet items={['Milk']} onClose={() => {}} onAdd={() => {}} busy error="Your list is full." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your list is full.');
  });

  it('stays closed with no items', () => {
    render(<ReceiptSheet items={null} onClose={() => {}} onAdd={() => {}} busy={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
