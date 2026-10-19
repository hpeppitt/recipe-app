import { useState, useEffect, useId } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TermsCheckbox, TermsHint } from './TermsCheckbox';
import { setTermsAcceptance, clearTermsAcceptance } from '../../services/storage';
import { TERMS_VERSION } from '../../lib/legal';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';
import { Mail } from '../ui/icons';
import { ActionIntro, EmailField, EmailStepHeading, EmailStepNotes, SentStep, type AuthAction } from './AuthSheetParts';

interface AuthModalProps {
  open: boolean;
  /** Names the headline and icon: "Sign in to <action>". */
  action: AuthAction;
  onAuthenticated: () => void;
  onDismiss: () => void;
}

/**
 * The sign-in sheet (5a, 5b, 5c). The only one with the guest option: an anonymous
 * account can keep local bookmarks and nothing else (decision 1a), so callers are the
 * places where that is enough.
 */
export function AuthModal({ open, action, onAuthenticated, onDismiss }: AuthModalProps) {
  const { user, signInAnonymously, sendEmailLink } = useAuth();
  const [step, setStep] = useState<'choose' | 'email' | 'sent'>('choose');
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  // Exactly one step renders at a time, so a single id can label the sheet and
  // follow the heading from step to step.
  const titleId = useId();
  const hintId = useId();

  // Each opening starts fresh.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep('choose');
      setEmail('');
      setAccepted(false);
      setError(null);
    }
  }

  // Auto-dismiss if user is already authenticated (including anonymous)
  useEffect(() => {
    if (open && user) {
      onAuthenticated();
    }
  }, [open, user, onAuthenticated]);

  const handleAnonymous = async () => {
    if (loading) return;
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
    // loading guards a second Enter while the first send is in flight.
    if (!email.trim() || loading) return;
    if (!accepted) {
      setError('Tick the box to accept the Terms before we send the link.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Stored first: the link can be opened before this promise settles.
      setTermsAcceptance({ version: TERMS_VERSION, acceptedAt: Date.now(), email: email.trim() });
      await sendEmailLink(email.trim());
      setStep('sent');
    } catch {
      // No link went out, so nothing may later record this tick.
      clearTermsAcceptance();
      setError('Failed to send sign-in link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open && !user} onClose={onDismiss} labelledBy={titleId}>
      <div className="flex min-w-0 flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        {step === 'choose' && (
          <>
            <ActionIntro
              action={action}
              titleId={titleId}
              body="Sign in to save recipes and get credited as the creator."
            />
            {/*
              Email leads because it is the option that keeps the user's work. The
              guest option is a text link with its trade-off stated, not a peer button.
            */}
            <Button
              fullWidth
              size="lg"
              className="h-[52px] gap-2"
              // Back from the email step remounts this, so focus lands here, not on <body>.
              autoFocus
              onClick={() => {
                setStep('email');
                setError(null);
              }}
              disabled={loading}
            >
              <Mail className="h-5 w-5 shrink-0" />
              Continue with email
            </Button>
            <Button fullWidth variant="ghost" onClick={handleAnonymous} disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Continue without an account'}
            </Button>
            <p className="mx-auto max-w-[290px] text-center text-xs text-text-tertiary">
              Bookmarks stay on this device only. You can add an email later.
            </p>
            {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
          </>
        )}

        {step === 'email' && (
          <>
            <EmailStepHeading titleId={titleId} />
            <TermsCheckbox
              checked={accepted}
              onChange={(c) => {
                setAccepted(c);
                if (c) setError(null);
              }}
              disabled={loading}
              invalid={!!error && !accepted}
              describedBy={accepted ? undefined : hintId}
            />
            <EmailField value={email} onChange={setEmail} onEnter={handleSendEmail} autoFocus />
            <Button
              fullWidth
              size="lg"
              className="h-[54px]"
              onClick={handleSendEmail}
              disabled={loading || !email.trim() || !accepted}
              aria-describedby={accepted ? undefined : hintId}
            >
              {loading ? <Spinner size="sm" /> : 'Send me a link'}
            </Button>
            {!accepted && <TermsHint id={hintId} />}
            {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
            <EmailStepNotes />
            <Button
              fullWidth
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setStep('choose');
                setError(null);
              }}
            >
              Back
            </Button>
          </>
        )}

        {step === 'sent' && (
          <SentStep
            titleId={titleId}
            email={email.trim()}
            onDifferentEmail={() => setStep('email')}
            onClose={onDismiss}
          />
        )}
      </div>
    </Sheet>
  );
}
