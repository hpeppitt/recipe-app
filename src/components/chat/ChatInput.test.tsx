// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessage';
import type { ImageAttachment } from '../../lib/imageAttachments';

const mocks = vi.hoisted(() => ({ downscale: vi.fn() }));
vi.mock('../../services/imageDownscale', () => ({ downscaleToJpeg: mocks.downscale }));

const NOTICE =
  "Photos are sent to Google's Gemini to write your recipe and are not saved. Leave out people and personal details.";
const att = (n: string): ImageAttachment => ({ mimeType: 'image/jpeg', base64: n });
const jpg = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  mocks.downscale.mockReset();
  mocks.downscale.mockImplementation(async (f: File) => att(f.name));
});
afterEach(cleanup);

describe('ChatInput', () => {
  it('keeps focus after a keyboard send once the composer is re-enabled', async () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatInput onSend={onSend} />);
    const box = screen.getByRole('textbox');
    const u = userEvent.setup();
    await u.type(box, 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello', []);
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

  describe('photos', () => {
    it('a valid pick shows a thumbnail with its alt text', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      await userEvent.setup().upload(fileInput(), jpg());
      expect(await screen.findByAltText('Attached photo 1 of 1')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeTruthy();
    });

    it('rejects a gif with the RL-118 copy in an alert and adds nothing', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
      await userEvent.setup({ applyAccept: false }).upload(fileInput(), gif);
      expect(screen.getByRole('alert').textContent).toBe('Use a JPEG, PNG or WebP photo.');
      expect(screen.queryByRole('img')).toBeNull();
      expect(mocks.downscale).not.toHaveBeenCalled();
    });

    it('a fourth photo shows the per-message limit and the attach button is disabled at three', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), [jpg('1.jpg'), jpg('2.jpg'), jpg('3.jpg')]);
      expect(await screen.findByAltText('Attached photo 3 of 3')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Add photos' }) as HTMLButtonElement).disabled).toBe(true);
      await u.upload(fileInput(), jpg('4.jpg'));
      expect(screen.getByRole('alert').textContent).toBe('You can add up to 3 photos at a time.');
      expect(screen.getAllByRole('img')).toHaveLength(3);
    });

    it('uses the per-chat limit with the photos already sent', async () => {
      render(<ChatInput onSend={vi.fn()} sentImageCount={6} />);
      await userEvent.setup().upload(fileInput(), jpg());
      expect(screen.getByRole('alert').textContent).toBe(
        'This chat already has 6 photos. Start a new recipe to use more.'
      );
    });

    it('a mixed pick adds the valid photos and reports the invalid one', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
      await userEvent.setup({ applyAccept: false }).upload(fileInput(), [jpg('1.jpg'), gif, jpg('2.jpg')]);
      expect(await screen.findByAltText('Attached photo 2 of 2')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBe('Use a JPEG, PNG or WebP photo.');
    });

    it('a failed downscale shows the unreadable copy, still adds the other photo', async () => {
      mocks.downscale.mockImplementation(async (f: File) => {
        if (f.name === 'bad.jpg') throw new Error('decode');
        return att(f.name);
      });
      render(<ChatInput onSend={vi.fn()} />);
      await userEvent.setup().upload(fileInput(), [jpg('bad.jpg'), jpg('ok.jpg')]);
      expect(await screen.findByAltText('Attached photo 1 of 1')).toBeTruthy();
      expect((await screen.findByRole('alert')).textContent).toBe(
        "That photo couldn't be read. Try another one."
      );
    });

    it('remove deletes the right thumbnail and focuses the next remove button', async () => {
      const onSend = vi.fn();
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), [jpg('1.jpg'), jpg('2.jpg'), jpg('3.jpg')]);
      await screen.findByAltText('Attached photo 3 of 3');
      await u.click(screen.getByRole('button', { name: 'Remove photo 2' }));
      expect(screen.getAllByRole('img')).toHaveLength(2);
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove photo 2' })));
      await u.click(screen.getByRole('button', { name: 'Send' }));
      expect(onSend).toHaveBeenCalledWith('', [att('1.jpg'), att('3.jpg')]);
    });

    it('focuses the attach button when the last photo is removed', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg());
      await u.click(await screen.findByRole('button', { name: 'Remove photo 1' }));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add photos' })));
    });

    it('the same file can be picked again after removal', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      const u = userEvent.setup();
      const file = jpg();
      await u.upload(fileInput(), file);
      await u.click(await screen.findByRole('button', { name: 'Remove photo 1' }));
      expect(fileInput().value).toBe('');
      await u.upload(fileInput(), file);
      expect(await screen.findByAltText('Attached photo 1 of 1')).toBeTruthy();
    });

    it('a removed photo whose downscale resolves late does not reappear', async () => {
      let resolve!: (a: ImageAttachment) => void;
      mocks.downscale.mockImplementation(() => new Promise<ImageAttachment>((r) => (resolve = r)));
      render(<ChatInput onSend={vi.fn()} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg());
      expect(screen.getByRole('status', { name: 'Preparing photo' })).toBeTruthy();
      await u.click(screen.getByRole('button', { name: 'Remove photo 1' }));
      await act(async () => resolve(att('late')));
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('a removed photo whose downscale fails late shows no error', async () => {
      let reject!: (e: Error) => void;
      mocks.downscale.mockImplementation(() => new Promise<ImageAttachment>((_, r) => (reject = r)));
      render(<ChatInput onSend={vi.fn()} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg());
      await u.click(screen.getByRole('button', { name: 'Remove photo 1' }));
      await act(async () => reject(new Error('x')));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('send is disabled while a photo is downscaling and enabled once it is ready', async () => {
      let resolve!: (a: ImageAttachment) => void;
      mocks.downscale.mockImplementation(() => new Promise<ImageAttachment>((r) => (resolve = r)));
      const onSend = vi.fn();
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.type(screen.getByRole('textbox'), 'hi');
      await u.upload(fileInput(), jpg());
      const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      await u.type(screen.getByRole('textbox'), '{Enter}');
      expect(onSend).not.toHaveBeenCalled();
      await act(async () => resolve(att('ok')));
      expect(send.disabled).toBe(false);
    });

    it('send passes the text and the images and clears both', async () => {
      const onSend = vi.fn();
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg('1.jpg'));
      await screen.findByAltText('Attached photo 1 of 1');
      await u.type(screen.getByRole('textbox'), '  make it like this ');
      await u.click(screen.getByRole('button', { name: 'Send' }));
      expect(onSend).toHaveBeenCalledWith('make it like this', [att('1.jpg')]);
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('a photos-only send is allowed', async () => {
      const onSend = vi.fn();
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg('1.jpg'));
      await screen.findByAltText('Attached photo 1 of 1');
      await u.click(screen.getByRole('button', { name: 'Send' }));
      expect(onSend).toHaveBeenCalledWith('', [att('1.jpg')]);
    });

    it('send stays disabled with no text and no photo', () => {
      render(<ChatInput onSend={vi.fn()} />);
      expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('a limit result keeps the text and photos and shows the limit copy', async () => {
      const onSend = vi.fn().mockResolvedValue('chat-limit');
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg('1.jpg'));
      await screen.findByAltText('Attached photo 1 of 1');
      await u.type(screen.getByRole('textbox'), 'hello');
      await u.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          'This chat already has 6 photos. Start a new recipe to use more.'
        )
      );
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello');
      expect(screen.getByAltText('Attached photo 1 of 1')).toBeTruthy();
    });

    it('a null result leaves the composer cleared', async () => {
      const onSend = vi.fn().mockResolvedValue(null);
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.type(screen.getByRole('textbox'), 'hello{Enter}');
      await act(async () => {});
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('a rejected send restores the text and photos without an error line', async () => {
      const onSend = vi.fn().mockRejectedValue(new Error('boom'));
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg('1.jpg'));
      await screen.findByAltText('Attached photo 1 of 1');
      await u.type(screen.getByRole('textbox'), 'hello');
      await u.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello'));
      expect(screen.getByAltText('Attached photo 1 of 1')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('restoring after a limit merges with what was added meanwhile, sent photos first and capped at three', async () => {
      let settle!: (v: 'message-limit') => void;
      const onSend = vi.fn().mockReturnValue(new Promise((r) => (settle = r)));
      render(<ChatInput onSend={onSend} />);
      const u = userEvent.setup();
      await u.upload(fileInput(), [jpg('1.jpg'), jpg('2.jpg')]);
      await screen.findByAltText('Attached photo 2 of 2');
      await u.type(screen.getByRole('textbox'), 'first');
      await u.click(screen.getByRole('button', { name: 'Send' }));
      await u.type(screen.getByRole('textbox'), 'second');
      await u.upload(fileInput(), [jpg('3.jpg'), jpg('4.jpg')]);
      await screen.findByAltText('Attached photo 2 of 2');
      await act(async () => settle('message-limit'));
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('first\nsecond');
      expect(screen.getAllByRole('img')).toHaveLength(3);
      expect(screen.getByAltText('Attached photo 3 of 3')).toBeTruthy();
    });

    it('announces an identical repeated error again by replacing the alert', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      const u = userEvent.setup({ applyAccept: false });
      const gif = () => new File(['x'], 'a.gif', { type: 'image/gif' });
      await u.upload(fileInput(), gif());
      const first = screen.getByRole('alert');
      await u.upload(fileInput(), gif());
      const second = screen.getByRole('alert');
      expect(second.textContent).toBe(first.textContent);
      expect(second).not.toBe(first);
    });

    it('calls onLayoutChange when a photo or an error appears, not on mount', async () => {
      const onLayoutChange = vi.fn();
      render(<ChatInput onSend={vi.fn()} onLayoutChange={onLayoutChange} />);
      expect(onLayoutChange).not.toHaveBeenCalled();
      await userEvent.setup().upload(fileInput(), jpg());
      await screen.findByAltText('Attached photo 1 of 1');
      expect(onLayoutChange).toHaveBeenCalled();
    });

    it('shows the privacy notice only while a photo is attached', async () => {
      render(<ChatInput onSend={vi.fn()} />);
      expect(screen.queryByText(NOTICE)).toBeNull();
      const u = userEvent.setup();
      await u.upload(fileInput(), jpg());
      expect(screen.getByText(NOTICE)).toBeTruthy();
      await u.click(await screen.findByRole('button', { name: 'Remove photo 1' }));
      expect(screen.queryByText(NOTICE)).toBeNull();
    });

    it('disables the attach button when the composer is disabled', () => {
      render(<ChatInput onSend={vi.fn()} disabled />);
      expect((screen.getByRole('button', { name: 'Add photos' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('a pick finishing after unmount is a no-op (smoke test: React 19 no longer warns)', async () => {
      let resolve!: (a: ImageAttachment) => void;
      mocks.downscale.mockImplementation(() => new Promise<ImageAttachment>((r) => (resolve = r)));
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onSend = vi.fn();
      const { unmount } = render(<ChatInput onSend={onSend} />);
      await userEvent.setup().upload(fileInput(), jpg());
      unmount();
      await act(async () => resolve(att('late')));
      expect(mocks.downscale).toHaveBeenCalledTimes(1);
      expect(onSend).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
    });
  });
});

describe('ChatMessageBubble photos', () => {
  const msg = { role: 'user' as const, content: 'Suggest a recipe based on these photos.', timestamp: 1 };

  it('shows each sent photo with its alt text above the text', () => {
    render(<ChatMessageBubble message={msg} photos={['data:image/jpeg;base64,a', 'data:image/jpeg;base64,b']} />);
    expect(screen.getByAltText('Your photo 1')).toBeTruthy();
    expect(screen.getByAltText('Your photo 2')).toBeTruthy();
    expect(screen.getByText('Suggest a recipe based on these photos.')).toBeTruthy();
  });

  it('shows no photos for a text-only message', () => {
    render(<ChatMessageBubble message={{ ...msg, content: 'hi' }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('hi')).toBeTruthy();
  });
});
