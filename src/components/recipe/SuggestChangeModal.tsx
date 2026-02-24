import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

interface SuggestChangeModalProps {
  open: boolean;
  recipeTitle: string;
  onSubmit: (message: string) => Promise<void>;
  onClose: () => void;
}

export function SuggestChangeModal({
  open,
  recipeTitle,
  onSubmit,
  onClose,
}: SuggestChangeModalProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setMessage('');
      setSubmitted(false);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      await onSubmit(message.trim());
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      {submitted ? (
        <>
          <div className="text-center py-4">
            <p className="text-3xl mb-3">✅</p>
            <h2 className="text-lg font-semibold text-text-primary">Suggestion sent</h2>
            <p className="text-sm text-text-secondary mt-2">
              The recipe owner will be notified of your suggestion.
            </p>
          </div>
          <Button fullWidth variant="secondary" onClick={onClose} className="mt-4">
            Close
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-text-primary">Suggest a Change</h2>
          <p className="text-sm text-text-secondary mt-1 mb-4">
            Suggest a modification to <strong>{recipeTitle}</strong>. The owner will
            review your suggestion.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Add more garlic, reduce cooking time..."
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow text-sm resize-none"
          />
          <div className="flex gap-3 mt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !message.trim()}
            >
              {loading ? <Spinner size="sm" /> : 'Send Suggestion'}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
