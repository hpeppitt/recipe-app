import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
    shell:
      'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950',
    title: 'text-warning-800 dark:text-warning-200',
    body: 'text-warning-700 dark:text-warning-300',
  },
  invite: {
    shell:
      'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950',
    title: 'text-primary-700 dark:text-primary-300',
    body: 'text-text-secondary',
  },
};

export function EmailLinkingForm({
  tone = 'warning',
  title = 'Your account is anonymous',
  description = 'Add an email to keep your recipes safe and access them from any device.',
  submitLabel = 'Add Email',
  icon,
}: {
  tone?: Tone;
  title?: string;
  description?: string;
  submitLabel?: string;
  /** Replaces the warning triangle. An emoji reads as an offer; the triangle does not. */
  icon?: string;
}) {
  const { user, linkEmail, sendEmailLink } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = TONES[tone];

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Two different Firebase calls behind one button, because the right one
      // depends on whether there is an account to upgrade. An anonymous user
      // must go through linkEmail, which keeps their uid and therefore
      // everything already published under it; a signed-out visitor has no uid
      // to preserve and needs a plain sign-in link. Calling linkEmail with no
      // current user would simply fail.
      const send = user?.isAnonymous ? linkEmail : sendEmailLink;
      await send(email.trim());
      setSent(true);
    } catch {
      setError('Failed to send link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="border border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950 rounded-2xl p-4 text-center space-y-2">
        <p className="text-sm font-medium text-success-700 dark:text-success-300">
          Check your email!
        </p>
        <p className="text-xs text-success-700 dark:text-success-400">
          We sent a link to <strong>{email}</strong>. Click it to secure your account.
        </p>
      </div>
    );
  }

  return (
    <div className={`border rounded-2xl p-4 space-y-3 ${styles.shell}`}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : (
          <svg
            className="w-5 h-5 text-warning-500 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        )}
        <div>
          <p className={`text-sm font-medium ${styles.title}`}>{title}</p>
          <p className={`text-xs mt-0.5 ${styles.body}`}>{description}</p>
        </div>
      </div>
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
        <Button size="sm" onClick={handleSubmit} disabled={loading || !email.trim()}>
          {loading ? 'Sending...' : submitLabel}
        </Button>
      </div>
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}
