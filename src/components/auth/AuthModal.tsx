import { useState, useEffect, useId, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';

interface AuthModalProps {
  open: boolean;
  onAuthenticated: () => void;
  onDismiss: () => void;
}

export function AuthModal({ open, onAuthenticated, onDismiss }: AuthModalProps) {
  const { user, signInAnonymously, sendEmailLink } = useAuth();
  const [step, setStep] = useState<'choose' | 'email' | 'sent'>('choose');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Exactly one step renders at a time, so a single id can label the dialog and
  // follow the heading from step to step.
  const titleId = useId();

  // Auto-dismiss if user is already authenticated (including anonymous)
  useEffect(() => {
    if (open && user) {
      onAuthenticated();
    }
  }, [open, user, onAuthenticated]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open && !user) {
      dialog.showModal();
      setStep('choose');
      setEmail('');
      setError(null);
    }
    if ((!open || user) && dialog.open) dialog.close();
  }, [open, user]);

  const handleAnonymous = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInAnonymously();
      onAuthenticated();
    } catch {
      setError('Failed to continue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await sendEmailLink(email.trim());
      setStep('sent');
    } catch {
      setError('Failed to send sign-in link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onDismiss}
      aria-labelledby={titleId}
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      {step === 'choose' && (
        <>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">Sign in to continue</h2>
          <p className="text-sm text-text-secondary mt-1 mb-5">
            Sign in to save recipes and get credited as the creator.
          </p>
          {/*
            Email leads because it is the option that keeps the user's work.
            Anonymous was the primary-styled default, which nudged people toward
            the lossy path without telling them it was lossy.

            The old footnote claimed email "lets your name appear on recipes you
            share" — untrue. Anonymous accounts are auto-assigned a generated
            display name (see generateDisplayName) that is credited identically.
            The differences below are the ones that actually exist.
          */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Button
                fullWidth
                onClick={() => setStep('email')}
                disabled={loading}
              >
                Sign in with Email
              </Button>
              <p className="text-xs text-text-tertiary">
                Keeps your recipes if you clear your browser, and lets you use them on
                your other devices.
              </p>
            </div>
            <div className="space-y-1.5">
              <Button
                fullWidth
                variant="secondary"
                onClick={handleAnonymous}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" /> : 'Continue Anonymously'}
              </Button>
              <p className="text-xs text-text-tertiary">
                Quickest, but your recipes stay in this browser only. Clearing site data
                deletes them, and you can't reach them from another device. You can add an
                email later from your profile.
              </p>
            </div>
          </div>
          {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}
        </>
      )}

      {step === 'email' && (
        <>
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">Sign in with Email</h2>
          <p className="text-sm text-text-secondary mt-1 mb-4">
            We'll send you a magic link — no password needed.
          </p>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            // Focused deliberately, unlike the composer in UX-29: the user has
            // just chosen "Sign in with Email" and typing an address is the only
            // thing left to do, so the keyboard appearing is the desired outcome
            // rather than something covering content they still need to read.
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendEmail();
            }}
          />
          <div className="flex gap-3 mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setStep('choose');
                setError(null);
              }}
            >
              Back
            </Button>
            <Button onClick={handleSendEmail} disabled={loading || !email.trim()}>
              {loading ? <Spinner size="sm" /> : 'Send Link'}
            </Button>
          </div>
          {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}
        </>
      )}

      {step === 'sent' && (
        <>
          <div className="text-center py-4">
            <p className="text-3xl mb-3">📧</p>
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">Check your email</h2>
            <p className="text-sm text-text-secondary mt-2">
              We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.
            </p>
          </div>
          <Button fullWidth variant="secondary" onClick={onDismiss} className="mt-4">
            Close
          </Button>
        </>
      )}
    </dialog>
  );
}
