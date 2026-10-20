import { useEffect, useRef, useState } from 'react';
import {
  MAX_IMAGES_PER_MESSAGE,
  attachmentErrorMessage,
  validateImageFile,
  type ImageAttachment,
} from '../../lib/imageAttachments';
import { downscaleToJpeg } from '../../services/imageDownscale';

/** A photo in the tray. `attachment` is unset while it is still being downscaled. */
export interface TrayPhoto {
  id: number;
  attachment?: ImageAttachment;
}

/**
 * Photo picking, downscaling and the error line, shared by ChatInput and
 * BranchComposer. Photos stay in this component's memory only.
 */
export function usePhotoTray(sentImageCount = 0) {
  const [photos, setPhotos] = useState<TrayPhoto[]>([]);
  const [error, setErrorText] = useState<string | null>(null);
  // Keys the alert so an identical repeated error is announced again.
  const [errorSeq, setErrorSeq] = useState(0);
  const setError = (msg: string | null) => {
    setErrorText(msg);
    if (msg) setErrorSeq((n) => n + 1);
  };
  // The ref is the source of truth so a pick and a late downscale never read a stale list.
  const photosRef = useRef<TrayPhoto[]>([]);
  const nextId = useRef(0);
  const mounted = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLButtonElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const focusAfterRemove = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  /** Puts sent photos back in front of any added since (after a send that did not happen). */
  const restorePhotos = (sent: TrayPhoto[]) =>
    updatePhotos((cur) => [...sent, ...cur].slice(0, MAX_IMAGES_PER_MESSAGE));

  const ready = photos.filter((p) => p.attachment);
  return {
    photos,
    ready: ready.map((p) => p.attachment!),
    /** A photo is still downscaling. */
    preparing: photos.length > ready.length,
    full: photos.length >= MAX_IMAGES_PER_MESSAGE,
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
    clearPhotos: () => updatePhotos(() => []),
  };
}
