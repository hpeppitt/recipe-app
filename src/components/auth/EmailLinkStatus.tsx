import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';

/**
 * Reports what happened when the user arrived on a magic link.
 *
 * Every state here used to be silence. A link that was expired, already used,
 * or opened on a different device from the one that requested it produced no
 * message at all: the user landed on a signed-out app having done everything
 * right. That is the whole reason this component exists.
 *
 * Rendered in `AppShell` above the outlet, because the link returns to the app
 * origin and the user can land on any of its routes.
 */
export function EmailLinkStatus() {
  const { linkState, submitLinkEmail, dismissLinkState } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (linkState.status === 'idle') return null;

  // A successful upgrade needs no announcement beyond the account itself
  // changing, and a plain sign-in even less. Only `linked` is worth a word,
  // because "your recipes came with you" is the reassurance the user wants.
  if (linkState.status === 'done') {
    if (!linkState.linked) return null;
    return (
      <Banner tone="success" role="status">
        <p className="text-sm font-medium text-success-800 dark:text-success-200">
          You're signed in, and your recipes came with you
        </p>
        <p className="text-xs text-success-700 dark:text-success-300 mt-0.5">
          This is the same account you were already using, now reachable by email on
          any device.
        </p>
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={dismissLinkState}>
            Got it
          </Button>
        </div>
      </Banner>
    );
  }

  if (linkState.status === 'completing') {
    return (
      <Banner tone="neutral" role="status">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <p className="text-sm font-medium text-text-primary">Signing you in…</p>
        </div>
      </Banner>
    );
  }

  if (linkState.status === 'needs-email') {
    const handle = async () => {
      if (!email.trim() || submitting) return;
      setSubmitting(true);
      try {
        await submitLinkEmail(email);
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <Banner tone="warning" role="alert">
        <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
          Confirm the email address to finish signing in
        </p>
        <p className="text-xs text-warning-700 dark:text-warning-300 mt-0.5">
          {/* Explains the cause, because otherwise being asked again looks like the
              app lost the address for no reason. */}
          You opened this link in a different browser from the one that asked for it,
          so we need the address again to check the link belongs to you.
        </p>
        <div className="flex gap-2 mt-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            aria-label="Email address"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handle();
            }}
          />
          <Button size="sm" onClick={handle} disabled={submitting || !email.trim()}>
            {submitting ? <Spinner size="sm" /> : 'Continue'}
          </Button>
        </div>
      </Banner>
    );
  }

  // Expired, taken, or otherwise failed. The link is single-use in every case, so
  // there is nothing to retry here; the honest action is to request a new one.
  const { title, body } = {
    expired: {
      title: 'That sign-in link has expired',
      body: 'Links can only be used once, and they time out. Request a new one and it will work.',
    },
    'email-taken': {
      title: 'That email already has an account',
      body:
        'Signing in with it will take you to that account, so anything you made here ' +
        'as a guest will stay under your guest name rather than moving across. ' +
        'Request a new link to continue.',
    },
    failed: {
      title: "That sign-in link didn't work",
      body: 'Something went wrong finishing your sign-in. Requesting a new link is the quickest fix.',
    },
  }[linkState.reason];

  return (
    <Banner tone="warning" role="alert">
      <p className="text-sm font-medium text-warning-800 dark:text-warning-200">{title}</p>
      <p className="text-xs text-warning-700 dark:text-warning-300 mt-0.5">{body}</p>
      <div className="mt-2">
        <Button size="sm" variant="secondary" onClick={dismissLinkState}>
          Dismiss
        </Button>
      </div>
    </Banner>
  );
}

function Banner({
  tone,
  role,
  children,
}: {
  tone: 'neutral' | 'warning' | 'success';
  role: 'status' | 'alert';
  children: React.ReactNode;
}) {
  const toneClasses = {
    neutral: 'border-border bg-surface-secondary',
    warning:
      'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950',
    success:
      'border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950',
  }[tone];

  return (
    <div role={role} className={`m-4 border rounded-2xl p-4 ${toneClasses}`}>
      {children}
    </div>
  );
}
