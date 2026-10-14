import { useEffect, useId, useRef } from 'react';
import { Button } from '../ui/Button';
import { EmailLinkingForm } from './EmailLinkingForm';

/**
 * The one-tap sign-up gate from SuggestChangeModal, for actions with no dialog
 * of their own (follow, profile editing). Anonymous and signed-out users cannot
 * write to the cloud (decision 1a), so these open this instead of writing.
 * EmailLinkingForm picks linkEmail or sendEmailLink by account type.
 */
export function SignUpDialog({
  open,
  title,
  body,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      {open && (
        <>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <p className="text-sm text-text-secondary mt-1 mb-4">{body}</p>
          <EmailLinkingForm
            tone="invite"
            icon="✉️"
            title="No password needed"
            description="We'll email you a link. Tap it and you're in."
            submitLabel="Sign up"
          />
          <Button fullWidth variant="secondary" onClick={onClose} className="mt-4">
            Not now
          </Button>
        </>
      )}
    </dialog>
  );
}
