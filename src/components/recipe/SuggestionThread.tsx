import { useId, useState } from 'react';
import { useSuggestionThread } from '../../hooks/useSuggestions';
import { useAuth } from '../../contexts/AuthContext';
import { timeAgo } from '../../lib/utils';
import type { Suggestion } from '../../types/social';

interface SuggestionThreadProps {
  suggestion: Suggestion;
}

/**
 * The reply conversation on one suggestion.
 *
 * Collapsed by default. An owner looking at a list of suggestions is triaging,
 * and expanding every thread inline would bury the approve/reject actions that
 * the list exists for.
 *
 * Open to both participants, and deliberately still open after approval or
 * rejection: a rejection is exactly when the suggester wants to ask why.
 */
export function SuggestionThread({ suggestion }: SuggestionThreadProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { messages, error, send } = useSuggestionThread(open ? suggestion : null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputId = useId();

  // Only the two participants may post, matching the Firestore rules. Anyone
  // else signed in can read the recipe but has no business in this thread.
  const canReply =
    !!user &&
    (user.uid === suggestion.recipeOwnerId || user.uid === suggestion.suggestedBy.uid);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await send(text);
      setDraft('');
    } catch {
      // Without this the reply vanished from the box and never appeared in the
      // thread, which reads as a delivered message.
      setSendError("Couldn't send that reply. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const count = messages.length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 -ml-3 px-3 inline-flex items-center rounded-lg text-xs font-medium text-text-secondary hover:underline hover:bg-surface-tertiary transition-colors"
      >
        {open ? 'Hide replies' : count > 0 ? `Replies (${count})` : 'Reply'}
      </button>

      {open && (
        <div className="mt-1 space-y-2">
          {error && (
            <p role="alert" className="text-xs text-danger-600">
              {error}
            </p>
          )}

          {!error && count === 0 && (
            <p className="text-xs text-text-tertiary">No replies yet.</p>
          )}

          {messages.map((m) => {
            const mine = m.fromUid === user?.uid;
            return (
              <div
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  mine
                    ? 'bg-primary-50 dark:bg-primary-950/40 text-text-primary'
                    : 'bg-surface-tertiary text-text-primary'
                }`}
              >
                <p>{m.text}</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {mine ? 'You' : (m.fromDisplayName ?? 'Anonymous')}
                  {' · '}
                  {timeAgo(m.createdAt)}
                </p>
              </div>
            );
          })}

          {canReply && (
            <div className="space-y-1">
              <label htmlFor={inputId} className="sr-only">
                Reply to this suggestion
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Write a reply…"
                  className="flex-1 min-h-11 px-3 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-tertiary"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() || sending}
                  className="min-h-11 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              {sendError && (
                <p role="alert" className="text-xs text-danger-600">
                  {sendError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
