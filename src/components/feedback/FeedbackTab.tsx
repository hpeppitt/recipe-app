import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedbackTab } from '../../hooks/useFeedbackTab';
import { feedbackContext, type FeedbackContext } from '../../lib/feedback';
import { FeedbackSheet } from './FeedbackSheet';

const SENT = 'Thanks. Feedback sent.';

/**
 * The Feedback tab on the right edge of every page (RL-287), for a verified user with the Settings
 * switch on. Mounted once in App, inside the router, so it is on every route.
 */
export function FeedbackTab() {
  const { user, isConfigured } = useAuth();
  const { feedbackTab } = useFeedbackTab();
  const { pathname } = useLocation();
  const [context, setContext] = useState<FeedbackContext | null>(null);
  const [toast, setToast] = useState(false);
  const tabRef = useRef<HTMLButtonElement>(null);
  // One id per draft: made on first open, reused on every retry and reopen, replaced only after a send lands.
  const draftId = useRef<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Not on cook mode (reviewer choice, RL-287): the tab would sit over a full-screen cooking view.
  const eligible = !!(isConfigured && user && !user.isAnonymous && user.emailVerified && feedbackTab && !/\/cook$/.test(pathname));
  const returnFocus = useRef(false);
  // After the sheet has unmounted, so the dialog is no longer modal when focus moves.
  useEffect(() => {
    if (context || !returnFocus.current) return;
    returnFocus.current = false;
    tabRef.current?.focus();
  }, [context]);
  const close = () => {
    returnFocus.current = true;
    setContext(null);
  };

  return (
    <>
      {eligible && (
        <button
          ref={tabRef}
          type="button"
          aria-label="Send feedback"
          onClick={() => {
            draftId.current ??= crypto.randomUUID();
            setContext(
              feedbackContext({
                pathname,
                width: window.innerWidth,
                height: window.innerHeight,
                theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                userAgent: navigator.userAgent,
                appVersion: __APP_VERSION__,
              })
            );
          }}
          className="fixed top-1/2 right-0 z-30 flex h-24 w-8 -translate-y-1/2 items-center justify-center rounded-l-[14px] bg-text-primary text-on-accent shadow-md before:absolute before:inset-y-0 before:-left-3 before:w-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <span aria-hidden="true" className="rotate-180 text-[13px] font-semibold [writing-mode:vertical-rl]">
            Feedback
          </span>
        </button>
      )}
      {eligible && user && context && draftId.current && (
        <FeedbackSheet
          user={user}
          context={context}
          draftId={draftId.current}
          onClose={close}
          onSent={() => {
            draftId.current = null;
            setToast(true);
            close();
          }}
        />
      )}
      <div role="status">
        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg">
            <p className="text-sm font-medium text-text-primary">{SENT}</p>
          </div>
        )}
      </div>
    </>
  );
}
