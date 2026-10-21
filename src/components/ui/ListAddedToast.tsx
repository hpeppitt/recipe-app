import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export interface ListToast {
  text: string;
  /** Show the View link (a successful add); also the longer 8 s timer. */
  view: boolean;
  /** Shows an Undo button instead of the View link (RL-232). */
  undo?: () => void;
}

/**
 * The "added to your list" toast (RL-218, RL-219). The role="status" region stays mounted so
 * a screen reader announces the text when it arrives. The timer waits while the toast is hovered
 * or focused (WCAG 2.2.1); touch does not count as hover.
 */
export function ListAddedToast({ toast, onDismiss, bottomClass = 'bottom-24' }: { toast: ListToast | null; onDismiss: () => void; bottomClass?: string }) {
  const [hold, setHold] = useState({ hover: false, focus: false });
  // Latest callback in a ref, so a parent re-render with a new function does not restart the timer.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  // A new toast, or none, starts unheld.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets a pause that belongs to the previous toast
    setHold({ hover: false, focus: false });
  }, [toast]);
  useEffect(() => {
    if (!toast || hold.hover || hold.focus) return;
    const t = setTimeout(() => dismiss.current(), toast.view || toast.undo ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [toast, hold]);

  return (
    <div
      role="status"
      onPointerEnter={(e) => e.pointerType !== 'touch' && setHold((h) => ({ ...h, hover: true }))}
      onPointerLeave={(e) => e.pointerType !== 'touch' && setHold((h) => ({ ...h, hover: false }))}
      onFocus={() => setHold((h) => ({ ...h, focus: true }))}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHold((h) => ({ ...h, focus: false }))}
      className={toast ? `fixed ${bottomClass} left-1/2 -translate-x-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg` : undefined}
    >
      {toast && (
        <>
          <p className="break-words text-sm font-medium text-text-primary">{toast.text}</p>
          {toast.undo && (
            <button type="button" autoFocus onClick={toast.undo} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-700">
              Undo
            </button>
          )}
          {toast.view && (
            <Link to="/kitchen/list" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent-700">
              View
            </Link>
          )}
        </>
      )}
    </div>
  );
}
