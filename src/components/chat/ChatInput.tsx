import { useState, useRef, useEffect } from 'react';
import { ArrowUp, ImagePlus, X } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  attachmentErrorMessage,
  validateImageFile,
  type AttachmentRejection,
  type ImageAttachment,
} from '../../lib/imageAttachments';
import { downscaleToJpeg } from '../../services/imageDownscale';

/** A photo in the tray. `attachment` is unset while it is still being downscaled. */
interface TrayPhoto {
  id: number;
  attachment?: ImageAttachment;
}

const PRIVACY_NOTICE =
  "Photos are sent to Google's Gemini to write your recipe and are not saved. Leave out people and personal details.";

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
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Type a message...',
  initialValue = '',
  sentImageCount = 0,
  onLayoutChange,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const [photos, setPhotos] = useState<TrayPhoto[]>([]);
  const [error, setErrorText] = useState<string | null>(null);
  // Keys the alert so an identical repeated error is announced again.
  const [errorSeq, setErrorSeq] = useState(0);
  const setError = (msg: string | null) => {
    setErrorText(msg);
    if (msg) setErrorSeq((n) => n + 1);
  };
  const lastLayout = useRef('0||0');
  // The ref is the source of truth so a pick and a late downscale never read a stale list.
  const photosRef = useRef<TrayPhoto[]>([]);
  const nextId = useRef(0);
  const mounted = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLButtonElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
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
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const key = `${photos.length}|${error ?? ''}|${errorSeq}`;
    if (key === lastLayout.current) return;
    lastLayout.current = key;
    onLayoutChange?.();
  });

  const updatePhotos = (fn: (prev: TrayPhoto[]) => TrayPhoto[]) => {
    if (!mounted.current) return;
    photosRef.current = fn(photosRef.current);
    setPhotos(photosRef.current);
  };

  useEffect(() => {
    if (focusAfterRemove.current === null) return;
    const buttons = trayRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const next = buttons[Math.min(focusAfterRemove.current, buttons.length - 1)] ?? attachRef.current;
    focusAfterRemove.current = null;
    next?.focus();
  }, [photos]);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset so choosing the same file again after removing it fires onChange.
    e.target.value = '';
    setError(null);
    let inMessage = photosRef.current.length;
    const messages: string[] = [];
    const accepted: { id: number; file: File }[] = [];
    for (const file of files) {
      const result = validateImageFile(file, { inMessage, inChat: sentImageCount + inMessage });
      if (!result.ok) {
        const msg = attachmentErrorMessage(result.reason);
        if (!messages.includes(msg)) messages.push(msg);
        continue;
      }
      inMessage++;
      accepted.push({ id: nextId.current++, file });
    }
    if (messages.length) setError(messages.join(' '));
    if (!accepted.length) return;
    updatePhotos((prev) => [...prev, ...accepted.map(({ id }) => ({ id }))]);
    for (const { id, file } of accepted) {
      downscaleToJpeg(file).then(
        (attachment) =>
          updatePhotos((prev) => prev.map((p) => (p.id === id ? { ...p, attachment } : p))),
        () => {
          // A photo removed while it was downscaling stays removed and stays quiet.
          if (!photosRef.current.some((p) => p.id === id)) return;
          updatePhotos((prev) => prev.filter((p) => p.id !== id));
          if (mounted.current) setError(attachmentErrorMessage('encode'));
        }
      );
    }
  };

  const removePhoto = (id: number) => {
    focusAfterRemove.current = photosRef.current.findIndex((p) => p.id === id);
    updatePhotos((prev) => prev.filter((p) => p.id !== id));
  };

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
    const ready = photos.filter((p) => p.attachment);
    if ((!trimmed && !ready.length) || photos.length > ready.length || disabled) return;
    refocus.current = document.activeElement === inputRef.current;
    const sent = photos;
    // Nothing was sent: give the user their text and photos back, merged with
    // whatever they have added since.
    const restore = (msg: string | null) => {
      if (!mounted.current) return;
      setValue((v) => (v && trimmed ? `${trimmed}\n${v}` : v || trimmed));
      updatePhotos((cur) => [...sent, ...cur].slice(0, MAX_IMAGES_PER_MESSAGE));
      if (msg) setError(msg);
    };
    void Promise.resolve(onSend(trimmed, ready.map((p) => p.attachment!))).then(
      (limit) => {
        if (limit) restore(attachmentErrorMessage(limit));
      },
      () => restore(null)
    );
    setValue('');
    updatePhotos(() => []);
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
      {photos.length > 0 && (
        <div className="mx-auto max-w-lg min-w-0">
          <p className="break-words pb-1.5 text-xs text-text-tertiary">{PRIVACY_NOTICE}</p>
          <div ref={trayRef} className="flex min-w-0 gap-3.5 pt-3.5 pr-3.5 pb-2">
            {photos.map((photo, i) => (
              <div key={photo.id} className="relative size-14 flex-shrink-0">
                {photo.attachment ? (
                  <img
                    src={`data:${photo.attachment.mimeType};base64,${photo.attachment.base64}`}
                    alt={`Attached photo ${i + 1} of ${photos.length}`}
                    className="size-14 rounded-[16px] object-cover"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-[16px] bg-neutral-100 text-text-secondary">
                    <Spinner size="icon" label="Preparing photo" />
                  </div>
                )}
                {/* 44px button around a 28px circle; the 14px gap keeps it off the next thumbnail */}
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -top-3.5 -right-3.5 flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-surface-secondary text-text-primary shadow-sm">
                    <X className="size-3.5" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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
      <div className="mx-auto flex min-h-[52px] max-w-lg min-w-0 items-center gap-2 rounded-[26px] bg-neutral-100 py-1.5 pr-1.5 pl-1.5 shadow-sm">
        <button
          ref={attachRef}
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || photos.length >= MAX_IMAGES_PER_MESSAGE}
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
            photos.some((p) => !p.attachment) ||
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
  );
}
