// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

afterEach(cleanup);

describe('ChatInput', () => {
  it('keeps focus after a keyboard send once the composer is re-enabled', async () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatInput onSend={onSend} />);
    const box = screen.getByRole('textbox');
    const u = userEvent.setup();
    await u.type(box, 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
    box.blur(); // browsers drop focus when a field is disabled; jsdom does not
    rerender(<ChatInput onSend={onSend} disabled />);
    expect(document.activeElement).not.toBe(box);
    rerender(<ChatInput onSend={onSend} />);
    expect(document.activeElement).toBe(box);
  });

  it('resets the grown height after a send', async () => {
    render(<ChatInput onSend={vi.fn()} />);
    const box = screen.getByRole('textbox');
    box.style.height = '96px';
    await userEvent.setup().type(box, 'a{Enter}');
    expect(box.style.height).toBe('auto');
  });
});
