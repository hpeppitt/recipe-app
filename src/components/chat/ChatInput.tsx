import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ArrowUp, ImagePlus } from '../ui/icons';
import {
  ACCEPTED_IMAGE_TYPES,
  attachmentErrorMessage,
  type AttachmentRejection,
  type ImageAttachment,
} from '../../lib/imageAttachments';
import { PhotoTray } from './PhotoTray';
import { usePhotoTray } from './usePhotoTray';

interface ChatInputProps {
  /**
   * May resolve to the hook's limit reason, in which case nothing was sent and
   * the text and photos are put back in the composer.
   */
  onSend: (
    message: string,
    images: ImageAttachment[]
  ) => void | Promise<AttachmentRejection | null>;
  /** Photos already sent in this chat, for the per-chat limit. */
  sentImageCount?: number;
  /** Called when the tray or the error line appears, changes or goes, so the page can keep the newest message in view. */
  onLayoutChange?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * Seed text for the composer. Used when approving a suggestion hands the
   * owner into the variation flow — the suggestion is prefilled but not sent,
   * so they can edit it and are never billed for a generation they did not ask
   * for.
   */
  initialValue?: string;
  /** Rendered at the start of the composer row, left of the input pill. */
  leading?: ReactNode;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Type a message...',
  initialValue = '',
  sentImageCount = 0,
  onLayoutChange,
  leading,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const {
    photos,
    ready,
    preparing,
    full,
    error,
    errorSeq,
    setError,
    mounted,
    fileRef,
    attachRef,
    trayRef,
    handlePick,
    removePhoto,
    restorePhotos,
    clearPhotos,
  } = usePhotoTray(sentImageCount);
  const lastLayout = useRef('0||0');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const refocus = useRef(false);

  /**
   * Autofocus only where it is free.
   *
   * On a touch device focusing the composer opens the on-screen keyboard, which
   * covers the suggestion chips — the only concrete instruction a first-time user
   * gets. On a pointer device focus costs the user nothing and saves a click, so
   * it is kept there.
   *
   * `(pointer: coarse)` rather than a user-agent check: it describes the input
   * device, which is the thing that actually determines whether a keyboard
   * appears. Guarded for environments without matchMedia (jsdom, SSR).
   */
  useEffect(() => {
    const coarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (coarse) return;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const key = `${photos.length}|${error ?? ''}|${errorSeq}`;
    if (key === lastLayout.current) return;
    lastLayout.current = key;
    onLayoutChange?.();
  });

  // A disabled textarea drops focus, so a reply sent from the keyboard would
  // otherwise leave the composer unfocused once the answer arrives.
  useEffect(() => {
    if (!disabled && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && !ready.length) || preparing || disabled) return;
    refocus.current = document.activeElement === inputRef.current;
    const sent = photos;
    // Nothing was sent: give the user their text and photos back, merged with
    // whatever they have added since.
    const restore = (msg: string | null) => {
      if (!mounted.current) return;
      setValue((v) => (v && trimmed ? `${trimmed}\n${v}` : v || trimmed));
      restorePhotos(sent);
      if (msg) setError(msg);
    };
    void Promise.resolve(onSend(trimmed, ready)).then(
      (limit) => {
        if (limit) restore(attachmentErrorMessage(limit));
      },
      () => restore(null)
    );
    setValue('');
    clearPhotos();
    setError(null);
    // onInput does not fire for a programmatic clear, so shrink the pill here.
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <PhotoTray photos={photos} trayRef={trayRef} onRemove={removePhoto} />
      {error && (
        <p key={errorSeq} role="alert" className="mx-auto max-w-lg min-w-0 break-words pb-2 text-[13px] text-accent-900">
          {error}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handlePick}
        className="hidden"
      />
      <div className="mx-auto flex max-w-lg min-w-0 items-center gap-2">
      {leading}
      <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-[26px] bg-neutral-100 py-1.5 pr-1.5 pl-1.5 shadow-sm">
        <button
          ref={attachRef}
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || full}
          // after: extends the 40px circle to a 44px hit area
          className="relative flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-transparent text-text-secondary after:absolute after:-inset-0.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:pointer-events-none disabled:opacity-50"
          aria-label="Add photos"
        >
          <ImagePlus className="size-5" />
        </button>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          rows={1}
          className="min-w-0 flex-1 resize-none bg-transparent py-2 text-base text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          style={{ maxHeight: '120px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 120) + 'px';
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            disabled ||
            preparing ||
            (!value.trim() && !photos.length)
          }
          // after: extends the 40px circle to a 44px hit area
          className="relative flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-on-accent transition-colors after:absolute after:-inset-0.5 after:content-[''] hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:pointer-events-none disabled:opacity-50 active:scale-95"
          aria-label="Send"
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
      </div>
    </div>
  );
}
