import { useState } from 'react';
import { Button } from '../ui/Button';
import { SUPPORT_EMAIL } from '../../lib/constants';
import { describeStrandedIdentity } from '../../lib/migration';
import { getStrandedIdentity, clearStrandedIdentity } from '../../services/storage';

/**
 * Tells the user when their published recipes could not follow them to a new
 * account, which is the app's one remaining silent data-loss path.
 *
 * Rendered inside `AppShell` rather than on a single page: the migration is
 * attempted during the page load that consumes the email sign-in link, and the
 * user can land on the library, their profile, or settings. The shell covers all
 * three, and the notice is read from localStorage rather than passed down, so no
 * page has to know about it.
 *
 * Dismissal is permanent by design. This is not a retryable error — nothing the
 * user does in the client can move the recipes — so re-showing it would only be
 * nagging about something they have already been told and cannot fix.
 */
export function StrandedIdentityNotice() {
  // Read once on mount. A migration that lands mid-session was written before
  // this component rendered, and one that lands after would need a page load to
  // reach anyway, since it happens during sign-in link handling.
  const [stranded, setStranded] = useState(getStrandedIdentity);

  if (!stranded) return null;

  const notice = describeStrandedIdentity(stranded, SUPPORT_EMAIL);

  const dismiss = () => {
    clearStrandedIdentity();
    setStranded(null);
  };

  return (
    <div
      role="status"
      className="m-4 border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
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
        <div>
          <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
            {notice.title}
          </p>
          <p className="text-xs text-warning-700 dark:text-warning-300 mt-0.5">
            {notice.body}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" as="a" href={notice.contactHref}>
          Ask us to move them
        </Button>
        <Button size="sm" variant="secondary" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
