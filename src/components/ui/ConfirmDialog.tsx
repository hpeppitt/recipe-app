import { useEffect, useId, useRef } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
  /** Disables both actions while the confirmed work is in flight. */
  busy?: boolean;
  /** One button only, for a message the user can only acknowledge. Esc still calls onCancel. */
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  cancelLabel = 'Cancel',
  busy = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Without these, a screen reader announces the dialog with no name at all —
  // the visible <h2> is not connected to the dialog element by default.
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      // Esc fires `cancel` before closing; while the confirmed work runs it must not close.
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className="backdrop:bg-neutral-900/40 dark:backdrop:bg-black/60 bg-surface rounded-card p-[22px] max-w-sm w-[calc(100%-2rem)] shadow-lg m-auto"
    >
      <div className="flex flex-col gap-2.5">
      <h2 id={titleId} className="break-words font-heading text-[22px] text-text-primary">
        {title}
      </h2>
      <p id={messageId} className="break-words text-sm text-text-secondary">
        {message}
      </p>
      <div className="mt-2 flex gap-2">
        {!hideCancel && (
          <Button variant="secondary" className="flex-1 min-h-12" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        )}
        {/* Destructive confirms use the dark terracotta primary, not the red danger fill. */}
        <Button
          className={`flex-1 min-h-12 ${confirmVariant === 'danger' ? 'bg-accent-700 hover:bg-accent-800 active:bg-accent-800' : ''}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </div>
      </div>
    </dialog>
  );
}
