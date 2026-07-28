import { useEffect, useId, useRef } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
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
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      <h2 id={titleId} className="text-lg font-semibold text-text-primary mb-2">
        {title}
      </h2>
      <p id={messageId} className="text-sm text-text-secondary mb-6">
        {message}
      </p>
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
