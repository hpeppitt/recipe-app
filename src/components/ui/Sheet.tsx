import { useEffect, useRef, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Id of the element that names the sheet; the caller renders it inside `children`. */
  labelledBy: string;
  /** False blocks Escape and backdrop taps, for work that must finish ("Signing you in"). */
  dismissible?: boolean;
  children: ReactNode;
}

/** Bottom sheet on a native dialog: focus trap, Escape and focus return come from the browser. */
export function Sheet({ open, onClose, labelledBy, dismissible = true, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      // The parent owns `open`; closing the dialog natively here would desync it.
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      // Pointer down and up must both land on the dialog itself (the backdrop), not the panel.
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (dismissible && pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
      className="backdrop:bg-neutral-900/45 bg-transparent p-0 m-0 mt-auto mx-auto w-full max-w-lg max-h-[90%] overflow-visible"
    >
      <div className="flex flex-col gap-4 bg-surface rounded-t-[36px] pt-3 px-[22px] pb-7 shadow-lg max-h-[90dvh] overflow-y-auto">
        <div aria-hidden="true" className="w-[44px] h-[5px] rounded-full bg-neutral-400 self-center shrink-0" />
        {children}
      </div>
    </dialog>
  );
}
