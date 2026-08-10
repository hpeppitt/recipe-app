import { useState, useEffect, useId, useRef } from 'react';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { EmailLinkingForm } from '../auth/EmailLinkingForm';
import { useAuth } from '../../contexts/AuthContext';

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
  const { user, isConfigured } = useAuth();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Suggesting needs a verified email (firestore.rules). Checked here rather
  // than on the button that opens this dialog because two pages open it, and a
  // gate on the destination cannot be forgotten by a third.
  //
  // Signed-out is included defensively rather than because it is reachable
  // today: both pages that open this dialog show their own sign-in modal first,
  // so a null user does not currently get this far. It is covered anyway
  // because the failure if it ever did would be silent rather than loud, since
  // `useSubmitSuggestion` used to return early on a null user without throwing,
  // which reads as success and would show "Suggestion sent" for a write that
  // never happened. That hook now throws; this is the second lock on the door.
  const needsSignUp = isConfigured && (!user || !user.emailVerified);
  // One id follows the heading across the form and confirmation states, so the
  // dialog keeps an accessible name after submitting.
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setMessage('');
      setSubmitted(false);
      setError(null);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(message.trim());
      setSubmitted(true);
    } catch (err) {
      // This used to be a bare try/finally. A rejected submit therefore skipped
      // setSubmitted, un-spun the button, and said nothing at all: the dialog
      // just sat there with the text still in it, and the rejection escaped as
      // an unhandled promise. Silence is the worst possible answer here, since
      // the user has just written something they wanted delivered.
      console.error('Submitting the suggestion failed', err);
      setError(
        "That didn't send. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      {submitted ? (
        <>
          <div className="text-center py-4">
            <p className="text-3xl mb-3">✅</p>
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">Suggestion sent</h2>
            <p className="text-sm text-text-secondary mt-2">
              The recipe owner will be notified of your suggestion.
            </p>
          </div>
          <Button fullWidth variant="secondary" onClick={onClose} className="mt-4">
            Close
          </Button>
        </>
      ) : needsSignUp ? (
        <>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            Sign up to suggest a change
          </h2>
          <p className="text-sm text-text-secondary mt-1 mb-4">
            Suggestions go to the person who wrote <strong>{recipeTitle}</strong>, so
            they come from a name rather than an anonymous account. Add your email and
            you can suggest, reply, and publish recipes of your own.
          </p>
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
      ) : (
        <>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">Suggest a Change</h2>
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
          {error && (
            <p role="alert" className="text-sm text-danger-600 mt-3">
              {error}
            </p>
          )}
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
