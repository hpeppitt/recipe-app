import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from '../ui/icons';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { UserPill } from '../ui/UserPill';
import { SuggestionThread } from './SuggestionThread';
import { pluralize, timeAgo } from '../../lib/utils';
import type { Suggestion } from '../../types/social';

interface SuggestionListProps {
  /** Already filtered: the owner's list is everything, anyone else's is their own. */
  suggestions: Suggestion[];
  isOwner: boolean;
  /** The suggestion being approved or declined; disables every review button. */
  reviewingId: string | null;
  reviewError: string | null;
  onReview: (id: string, action: 'approve' | 'reject', message: string) => void;
}

const actionButton =
  'inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 font-heading text-sm whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';
const secondary = `${actionButton} border border-border text-text-primary hover:bg-surface-secondary`;

const closedTag = {
  approved: { label: 'Approved', cls: 'bg-accent-2-100 text-accent-2-800' },
  rejected: { label: 'Declined', cls: 'bg-neutral-100 text-neutral-800' },
} as const;

/**
 * The suggestions section under the recipe body. The owner's attention is kept
 * by the pending badge on More (RL-100), so this no longer sits above the body.
 */
export function SuggestionList({
  suggestions,
  isOwner,
  reviewingId,
  reviewError,
  onReview,
}: SuggestionListProps) {
  const [declining, setDeclining] = useState<{ id: string; message: string } | null>(null);
  // Until RL-106 adds a thread screen, Replies and closed rows expand the thread inline.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const baseId = useId();
  if (suggestions.length === 0) return null;

  const open = suggestions.filter((s) => s.status === 'pending');
  const closed = suggestions.filter((s) => s.status !== 'pending');
  const counts = [
    open.length > 0 && `${open.length} open`,
    closed.length > 0 && `${closed.length} closed`,
  ]
    .filter(Boolean)
    .join(' · ');
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));
  const threadId = (s: Suggestion) => `${baseId}-${s.id}`;
  const thread = (s: Suggestion) =>
    expandedId === s.id && (
      <div id={threadId(s)}>
        <SuggestionThread suggestion={s} />
      </div>
    );
  const controls = (s: Suggestion) => (expandedId === s.id ? threadId(s) : undefined);

  return (
    <section aria-label="Suggestions" className="!mt-[26px]">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h3 className="flex-1 font-heading text-lg text-text-primary">
          {isOwner ? 'Suggestions' : pluralize(suggestions.length, 'Your suggestion')}
        </h3>
        <span className="text-[13px] text-text-tertiary">{counts}</span>
      </div>
      {/* A failed review used to be entirely silent: the row stayed pending. */}
      {reviewError && (
        <p role="alert" className="mb-2 text-xs text-danger-600">
          {reviewError}
        </p>
      )}
      <div className="space-y-3">
        {open.map((s) => (
          <div key={s.id} className="flex flex-col gap-2.5 rounded-[28px] bg-surface p-3.5 shadow-md">
            <div className="flex items-center gap-2 text-[13px]">
              {/* The ring is on the wrapper: the wrapper clips, so a ring on the link would be cut. */}
              <span className="min-w-0 overflow-hidden rounded-full focus-within:ring-2 focus-within:ring-primary-500">
                <Link
                  to={`/profile/${s.suggestedBy.uid}`}
                  className="inline-flex min-h-11 items-center focus-visible:outline-none"
                >
                  <UserPill uid={s.suggestedBy.uid} name={s.suggestedBy.displayName || 'Someone'} />
                </Link>
              </span>
              <span className="flex-1 text-text-tertiary">{timeAgo(s.createdAt)}</span>
              <span className="shrink-0 rounded-full bg-accent-100 px-2 py-0.5 font-semibold text-accent-800">
                Open
              </span>
            </div>
            <p className="break-words text-sm text-text-primary">{s.message || '(No message)'}</p>
            <div className="flex gap-2">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setDeclining({ id: s.id, message: s.message })}
                  disabled={reviewingId !== null}
                  className={secondary}
                >
                  Decline
                </button>
              )}
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={expandedId === s.id}
                aria-controls={controls(s)}
                className={secondary}
              >
                <MessageCircle className="h-4 w-4 shrink-0 max-[399px]:hidden" />
                {isOwner ? 'Replies' : 'Reply'}
              </button>
              {isOwner && (
                <button
                  type="button"
                  // Approving carries the owner into the variation composer with
                  // the suggestion prefilled (RL-017).
                  onClick={() => onReview(s.id, 'approve', s.message)}
                  disabled={reviewingId !== null}
                  className={`${actionButton} bg-primary-600 text-on-accent hover:bg-primary-700 ${reviewingId === s.id ? '!px-1' : ''}`}
                >
                  {reviewingId === s.id ? 'Working…' : 'Approve'}
                </button>
              )}
            </div>
            {thread(s)}
          </div>
        ))}
      </div>
      {closed.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {closed.map((s) => {
            const tag = closedTag[s.status === 'approved' ? 'approved' : 'rejected'];
            const message = s.message || '(No message)';
            return (
              <div key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-expanded={expandedId === s.id}
                  aria-controls={controls(s)}
                  aria-label={`${message}, ${tag.label}`}
                  className="flex min-h-11 w-full items-center gap-2.5 px-1 py-2.5 text-left text-sm"
                >
                  <span className="min-w-0 max-w-[40%] shrink-0 overflow-hidden">
                    {/* Not a link: it sits inside a button. */}
                    <UserPill uid={s.suggestedBy.uid} name={s.suggestedBy.displayName || 'Someone'} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-primary">{message}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tag.cls}`}>
                    {tag.label}
                  </span>
                </button>
                {thread(s)}
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={declining !== null}
        title="Decline this suggestion?"
        message={
          declining
            ? `"${declining.message}" will be marked declined and the suggester will be notified. This can't be undone.`
            : ''
        }
        confirmLabel="Decline"
        confirmVariant="danger"
        onConfirm={() => {
          const target = declining;
          setDeclining(null);
          if (target) onReview(target.id, 'reject', target.message);
        }}
        onCancel={() => setDeclining(null)}
      />
    </section>
  );
}
