import { useCallback, useEffect, useRef, useState } from 'react';

/** How long after a save tap the favourite may flip and still count as that save. */
export const SAVE_WINDOW_MS = 6000;

/** How soon after a pointerdown its click still counts as the same tap. */
const POINTER_CLICK_MS = 1000;
let lastPointerDown = { at: -Infinity, type: '' };
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => (lastPointerDown = { at: Date.now(), type: e.pointerType }), true);
}

/**
 * Whether a click came from a mouse, pen or finger: a pointerdown of that type just before it and
 * a click detail above 0. Keyboard and assistive clicks have no pointerdown and detail 0. Read from
 * the pointerdown because Safari's click events carry no pointerType.
 */
export function isPointerClick(e: { detail: number }, now = Date.now()): boolean {
  return e.detail > 0 && now - lastPointerDown.at < POINTER_CLICK_MS && ['mouse', 'touch', 'pen'].includes(lastPointerDown.type);
}

let lastClickWasPointer = false;
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => (lastClickWasPointer = isPointerClick(e)), true);
}

/**
 * Opens the "Add to a collection?" sheet (RL-223) when a verified user's save tap turns the
 * favourite on for that recipe. Watching the flip rather than the tap means a failed save opens
 * nothing and an unsave never does. `onSaveTap` goes in the save handler. `auto` says the tap was a
 * pointer, the only case where the sheet may close itself (WCAG 2.2.1). The sheet is open only for
 * the recipe it was opened for.
 */
export function useCollectionSheet(recipeId: string | undefined, isFavorite: boolean, verified: boolean) {
  const [opened, setOpened] = useState<{ id: string; auto: boolean } | null>(null);
  const tap = useRef<{ id: string; at: number; auto: boolean } | null>(null);
  const prev = useRef({ id: recipeId, fav: isFavorite });

  useEffect(() => {
    const p = prev.current;
    prev.current = { id: recipeId, fav: isFavorite };
    // A different recipe is not a flip, and drops a tap meant for the old one.
    if (p.id !== recipeId) {
      tap.current = null;
      return;
    }
    const t = tap.current;
    if (!(isFavorite && !p.fav) || !t || t.id !== recipeId) return;
    tap.current = null;
    if (Date.now() - t.at < SAVE_WINDOW_MS) setOpened({ id: recipeId, auto: t.auto });
  }, [recipeId, isFavorite]);

  const onSaveTap = useCallback(() => {
    tap.current = recipeId && verified && !isFavorite ? { id: recipeId, at: Date.now(), auto: lastClickWasPointer } : null;
  }, [recipeId, verified, isFavorite]);
  const close = useCallback(() => setOpened(null), []);
  const open = !!recipeId && opened?.id === recipeId;
  return { open, auto: open && opened.auto, onSaveTap, close };
}
