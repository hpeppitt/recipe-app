import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRecipe } from '../hooks/useRecipe';
import { useSuggestions, useSuggestionThread } from '../hooks/useSuggestions';
import { useSuggestionReview } from '../hooks/useSuggestionReview';
import { DeclineSuggestionDialog } from '../components/recipe/SuggestionList';
import { AuthModal } from '../components/auth/AuthModal';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { PageFallback } from '../components/ui/PageFallback';
import { ArrowUp, ChevronLeft, CloudOff, MessageCircle, RotateCw } from '../components/ui/icons';
import { rateLimitMessage } from '../lib/errors';
import { timeAgo } from '../lib/utils';

const STATUS_TAG = {
  pending: { label: 'Open', cls: 'bg-accent-100 text-accent-800' },
  approved: { label: 'Approved', cls: 'bg-accent-2-100 text-accent-2-800' },
  rejected: { label: 'Declined', cls: 'bg-neutral-100 text-neutral-800' },
} as const;

const ownerButton =
  'inline-flex h-12 min-w-0 items-center justify-center rounded-full px-2 font-heading text-[15px] whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

/** How long the page waits for the suggestions listener before offering Retry. */
const SUGGESTION_LOAD_TIMEOUT_MS = 8000;

/**
 * The reply conversation on one suggestion (10a), at
 * /recipe/:id/suggestion/:suggestionId, replacing the inline SuggestionThread.
 *
 * Keyed by the suggestion id so back/forward between two threads cannot carry
 * one thread's draft, error or open dialog into the other, and by a retry
 * count so Retry remounts the listeners without a service change.
 */
export function SuggestionThreadPage() {
  const { suggestionId } = useParams<{ suggestionId: string }>();
  const [attempt, setAttempt] = useState(0);
  return <SuggestionThreadScreen key={`${suggestionId}:${attempt}`} onRetry={() => setAttempt((a) => a + 1)} />;
}

/**
 * The suggestion is found through the same listener the recipe page uses, so
 * only the two participants with a verified email ever see it (RL-018); for
 * anyone else it is simply not in their list and the error state shows. The
 * reply listener opens only once the suggestion is found.
 *
 * Deliberately still open after approval or rejection: a rejection is exactly
 * when the suggester wants to ask why.
 */
function SuggestionThreadScreen({ onRetry }: { onRetry: () => void }) {
  const { id, suggestionId } = useParams<{ id: string; suggestionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { recipe, isLoading: recipeLoading, cloudError, retry: retryRecipe } = useRecipe(id);
  const ownerUid = recipe?.createdBy?.uid;
  const { suggestions, loaded, approve, reject } = useSuggestions(id, ownerUid);
  const suggestion = suggestions.find((s) => s.id === suggestionId) ?? null;
  const { messages, error: threadError, send } = useSuggestionThread(suggestion);
  const { reviewingId, reviewError, review } = useSuggestionReview(id, approve, reject);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Same gate as the hooks: no listener opens for signed-out, anonymous or
  // unverified viewers, so there is nothing to wait for.
  const canRead = isConfigured && !!user?.emailVerified;
  const listening = canRead && !!ownerUid && !loaded;

  // subscribeRecipeSuggestions has no error callback, so a listener that never
  // answers (offline with no cache) would otherwise spin forever.
  useEffect(() => {
    if (!listening) return;
    const timer = setTimeout(() => setTimedOut(true), SUGGESTION_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [listening]);

  // Newest at the bottom: scroll to it on open and whenever a reply lands.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, suggestion?.id]);

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(`/recipe/${id}`));
  const backButton = (
    <IconButton variant="flat" label="Back" icon={<ChevronLeft className="h-6 w-6" />} onClick={goBack} />
  );
  const errorPage = (state: ReactNode) => (
    <div className="mx-auto min-h-dvh max-w-lg bg-surface">
      <header className="flex items-center px-3 pt-3">{backButton}</header>
      <div role="alert">{state}</div>
    </div>
  );

  if (canRead && (cloudError || (listening && timedOut))) {
    return errorPage(
      <EmptyState
        tone="error"
        icon={<CloudOff />}
        title="Couldn't load this suggestion"
        description="Check your connection and try again. If it keeps happening you may not have access to this suggestion."
        action={
          <Button variant="secondary" onClick={cloudError ? retryRecipe : onRetry}>
            <RotateCw className="mr-2 size-4" />
            Retry
          </Button>
        }
      />
    );
  }

  if (authLoading || (canRead && (recipeLoading || listening))) {
    return (
      <div className="mx-auto min-h-dvh max-w-lg bg-surface">
        <header className="flex items-center px-3 pt-3">{backButton}</header>
        <div role="status" aria-label="Loading suggestion">
          {/* Hidden so the Spinner's own generic "Loading" status is not announced too. */}
          <div aria-hidden="true">
            <PageFallback />
          </div>
        </div>
      </div>
    );
  }

  if (!suggestion) {
    const signedOut = isConfigured && !user;
    return (
      <>
        {errorPage(
          <EmptyState
            tone="error"
            icon={<MessageCircle />}
            title="Couldn't open this suggestion"
            description="Only the recipe's owner and the person who suggested the change can open it, signed in with a verified email."
            action={signedOut ? <Button onClick={() => setShowAuth(true)}>Sign in</Button> : undefined}
          />
        )}
        {signedOut && (
          <AuthModal open={showAuth} onAuthenticated={() => setShowAuth(false)} onDismiss={() => setShowAuth(false)} />
        )}
      </>
    );
  }

  const isOwner = user?.uid === suggestion.recipeOwnerId;
  // Only the two participants may post, matching the Firestore rules.
  const canReply = isOwner || user?.uid === suggestion.suggestedBy.uid;
  const suggesterName = suggestion.suggestedBy.displayName || 'Someone';
  const otherName = isOwner ? suggesterName : recipe?.createdBy?.displayName || 'Someone';
  const tag = STATUS_TAG[suggestion.status] ?? STATUS_TAG.pending;
  const message = suggestion.message || '(No message)';

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await send(text);
      setDraft('');
    } catch (err) {
      // Without this the reply vanished from the box and never appeared in the
      // thread, which reads as a delivered message.
      setSendError(rateLimitMessage(err) ?? "Couldn't send that reply. Please try again.");
    } finally {
      setSending(false);
      // The send button disables once the box empties, which would drop focus.
      inputRef.current?.focus();
    }
  };

  const errors = [threadError, reviewError, sendError].filter((e): e is string => !!e);

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col bg-surface">
      <header className="flex shrink-0 items-center gap-1 px-3 pt-[calc(12px+env(safe-area-inset-top))] pb-2">
        {backButton}
        <h1 className="min-w-0 flex-1 truncate font-heading text-lg text-text-primary">Suggestion</h1>
        <span className={`mr-2.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tag.cls}`}>
          {tag.label}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-3 pb-3">
        <section aria-label="Suggestion" className="flex flex-col gap-3 rounded-[30px] bg-surface-secondary p-4">
          <div className="flex items-center gap-2.5 text-[13px] text-text-primary">
            <span className="shrink-0 [&>div]:h-8 [&>div]:w-8 [&>div]:text-xs">
              <Avatar uid={suggestion.suggestedBy.uid} name={suggesterName} />
            </span>
            <p className="min-w-0 flex-1 break-words">
              <b>{suggesterName}</b> on <b>{suggestion.recipeTitle || recipe?.title || 'a recipe'}</b>
            </p>
            <span className="shrink-0 text-text-tertiary">{timeAgo(suggestion.createdAt)}</span>
          </div>
          <p className="whitespace-pre-line break-words text-sm leading-normal text-text-primary">{message}</p>
        </section>

        {messages.length === 0 && !threadError && (
          <p className="text-center text-xs text-text-tertiary">No replies yet.</p>
        )}

        <ul aria-label="Replies" aria-live="polite" className="flex flex-col gap-3">
          {messages.map((m) => {
            const mine = m.fromUid === user?.uid;
            const name = mine ? 'You' : m.fromDisplayName || 'Someone';
            return (
              <li key={m.id} className={`flex min-w-0 items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (
                  <span className="mb-5 shrink-0 [&>div]:h-[26px] [&>div]:w-[26px] [&>div]:text-[10px]">
                    <Avatar uid={m.fromUid} name={name} />
                  </span>
                )}
                <div className={`flex min-w-0 max-w-[260px] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <span className="sr-only">{name}: </span>
                  <p
                    className={`max-w-full break-words px-4 py-3 text-sm ${
                      mine
                        ? 'rounded-[24px_24px_6px_24px] bg-accent-2-200 text-accent-2-900'
                        : 'rounded-[24px_24px_24px_6px] bg-neutral-100 text-neutral-900'
                    }`}
                  >
                    {m.text}
                  </p>
                  <span className="mt-1 text-[11px] text-text-tertiary">{timeAgo(m.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={endRef} />
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 bg-surface px-4 pt-2.5 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--color-border)]">
        {errors.map((e) => (
          <p key={e} role="alert" className="text-xs text-danger-700 dark:text-danger-300">
            {e}
          </p>
        ))}
        {canReply && (
          <div className="flex h-12 items-center rounded-full bg-neutral-100 pr-0.5 pl-[18px]">
            <label htmlFor={inputId} className="sr-only">
              Reply to {otherName}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Reply to ${otherName}…`}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-600 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Send reply"
              onClick={() => void handleSend()}
              disabled={!draft.trim() || sending}
              className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span
                className={`flex size-9 items-center justify-center rounded-full ${
                  draft.trim() ? 'bg-primary-600 text-on-accent' : 'bg-neutral-300 text-neutral-700'
                }`}
              >
                <ArrowUp className="h-[18px] w-[18px]" />
              </span>
            </button>
          </div>
        )}
        {isOwner && suggestion.status === 'pending' && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setDeclining(suggestion.message)}
              disabled={reviewingId !== null}
              className={`${ownerButton} flex-1 border border-border text-text-primary hover:bg-surface-secondary`}
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => void review(suggestion.id, 'approve', suggestion.message)}
              disabled={reviewingId !== null}
              className={`${ownerButton} flex-[1.2] bg-primary-600 text-on-accent hover:bg-primary-700`}
            >
              {reviewingId === suggestion.id ? 'Working…' : 'Approve'}
            </button>
          </div>
        )}
      </div>

      <DeclineSuggestionDialog
        message={declining}
        onConfirm={() => {
          const target = declining;
          setDeclining(null);
          if (target !== null) void review(suggestion.id, 'reject', target);
        }}
        onCancel={() => setDeclining(null)}
      />
    </div>
  );
}
