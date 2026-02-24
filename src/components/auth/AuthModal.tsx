import { useState, useEffect, useRef } from 'react';
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
  const { signInAnonymously, sendEmailLink } = useAuth();
  const [step, setStep] = useState<'choose' | 'email' | 'sent'>('choose');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      setStep('choose');
      setEmail('');
      setError(null);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      {step === 'choose' && (
        <>
          <h2 className="text-lg font-semibold text-text-primary">Sign in to continue</h2>
          <p className="text-sm text-text-secondary mt-1 mb-6">
            Sign in to save recipes and get credited as the creator.
          </p>
          <div className="space-y-3">
            <Button fullWidth onClick={handleAnonymous} disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Continue Anonymously'}
            </Button>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => setStep('email')}
              disabled={loading}
            >
              Sign in with Email
            </Button>
          </div>
          <p className="text-xs text-text-tertiary mt-4 text-center">
            Email sign-in lets your name appear on recipes you share.
          </p>
          {error && <p className="text-sm text-danger-600 mt-3">{error}</p>}
        </>
      )}

      {step === 'email' && (
        <>
          <h2 className="text-lg font-semibold text-text-primary">Sign in with Email</h2>
          <p className="text-sm text-text-secondary mt-1 mb-4">
            We'll send you a magic link — no password needed.
          </p>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
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
            <h2 className="text-lg font-semibold text-text-primary">Check your email</h2>
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
