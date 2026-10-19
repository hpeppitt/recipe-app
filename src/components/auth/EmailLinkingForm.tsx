import { useId, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { TermsCheckbox, TermsHint } from './TermsCheckbox';
import { setTermsAcceptance, clearTermsAcceptance } from '../../services/storage';
import { TERMS_VERSION } from '../../lib/legal';
import { Input } from '../ui/Input';
import { TriangleAlert } from '../ui/icons';
import { EmailField, EmailStepNotes } from './AuthSheetParts';

/**
 * Two readings of the same action, so one implementation with two tones.
 *
 * `warning` is the profile banner: you already have an account, it is fragile,
 * here is how to secure it. `invite` is the contribute gate: you have just been
 * stopped from doing something, and this is the way through. Same request, but a
 * block that scolds reads very differently from one that offers, and the gate is
 * the first thing a new person meets.
 */
type Tone = 'warning' | 'invite';

const TONES: Record<Tone, { shell: string; title: string; body: string }> = {
  warning: {
    shell: 'border-warning-200 bg-warning-50',
    title: 'text-warning-800',
    body: 'text-warning-700',
  },
  invite: {
    shell: 'border-primary-200 bg-primary-50',
    title: 'text-primary-700',
    body: 'text-text-secondary',
  },
};

export function EmailLinkingForm({
  tone = 'warning',
  title = 'Your account is anonymous',
  description = 'Add an email to keep your recipes safe and access them from any device.',
  submitLabel = 'Add Email',
  icon,
  bare = false,
  onSent,
  onBusyChange,
}: {
  tone?: Tone;
  title?: string;
  description?: string;
  submitLabel?: string;
  /** Replaces the warning triangle. An emoji reads as an offer; the triangle does not. */
  icon?: string;
  /** Drops the card shell and heading, for a host that supplies its own (the profile's guest card). */
  bare?: boolean;
  /** Called with the address instead of showing the inline sent card, for a host with its own sent step (SignUpDialog). */
  onSent?: (email: string) => void;
  /** True while a send is in flight, so the host can hold its own controls (SignUpDialog's Back). */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user, linkEmail, sendEmailLink } = useAuth();
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = TONES[tone];
  const hintId = useId();

  const handleSubmit = async () => {
    // loading guards a second Enter while the first send is in flight.
    if (!email.trim() || loading) return;
    if (!accepted) {
      setError('Tick the box to accept the Terms before we send the link.');
      return;
    }
    setLoading(true);
    onBusyChange?.(true);
    setError(null);
    try {
      // Two different Firebase calls behind one button, because the right one
      // depends on whether there is an account to upgrade. An anonymous user
      // must go through linkEmail, which keeps their uid and therefore
      // everything already published under it; a signed-out visitor has no uid
      // to preserve and needs a plain sign-in link. Calling linkEmail with no
      // current user would simply fail.
      const send = user?.isAnonymous ? linkEmail : sendEmailLink;
      // Stored first: the link can be opened before this promise settles.
      setTermsAcceptance({ version: TERMS_VERSION, acceptedAt: Date.now(), email: email.trim() });
      await send(email.trim());
      if (onSent) onSent(email.trim());
      else setSent(true);
    } catch {
      // No link went out, so nothing may later record this tick.
      clearTermsAcceptance();
      setError('Failed to send link. Please try again.');
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  if (sent) {
    return (
      <div className="border border-success-200 bg-success-50 rounded-2xl p-4 text-center space-y-2">
        <p className="text-sm font-medium text-success-700">
          Check your email!
        </p>
        <p className="text-xs text-success-700">
          We sent a link to <strong>{email}</strong>. Click it to secure your account.
        </p>
      </div>
    );
  }

  return (
    <div className={bare ? 'space-y-3' : `border rounded-2xl p-4 space-y-3 ${styles.shell}`}>
      {!bare && (
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : (
          <TriangleAlert className="w-5 h-5 text-warning-500 mt-0.5 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-medium ${styles.title}`}>{title}</p>
          <p className={`text-xs mt-0.5 ${styles.body}`}>{description}</p>
        </div>
      </div>
      )}
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
      {tone === 'invite' ? (
        // The 5b look (RL-108): labelled pill field, full-width send, then the notes.
        <>
          {/* Hosted in the sheet (onSent), the user just chose email, so focus the field; inline gates do not grab focus. */}
          <EmailField value={email} onChange={setEmail} onEnter={handleSubmit} autoFocus={!!onSent} />
          <Button
            fullWidth
            size="lg"
            className="h-[54px]"
            onClick={handleSubmit}
            disabled={loading || !email.trim() || !accepted}
            aria-describedby={accepted ? undefined : hintId}
          >
            {loading ? 'Sending...' : submitLabel}
          </Button>
        </>
      ) : (
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={loading || !email.trim() || !accepted}
          aria-describedby={accepted ? undefined : hintId}
        >
          {loading ? 'Sending...' : submitLabel}
        </Button>
      </div>
      )}
      {!accepted && <TermsHint id={hintId} />}
      {error && <p role="alert" className="text-xs text-danger-700">{error}</p>}
      {/* Only in the sheet: the older card gates already say the same in their own description. */}
      {tone === 'invite' && onSent && <EmailStepNotes />}
    </div>
  );
}
