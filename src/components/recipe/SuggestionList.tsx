import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ellipsis, GitBranch, MessageCircle } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { SuggestionDiffRow } from './SuggestionDiffRow';
import { describeEdit, hasApplicableEdits } from '../../lib/suggestion';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { UserPill } from '../ui/UserPill';
import { pluralize, timeAgo } from '../../lib/utils';
import type { Suggestion } from '../../types/social';

interface SuggestionListProps {
  /** Already filtered: the owner's list is everything, anyone else's is their own. */
  suggestions: Suggestion[];
  isOwner: boolean;
  /** The suggestion being reviewed; disables every review button. */
  reviewingId: string | null;
  reviewError: string | null;
  onApply: (id: string) => void;
  onKeepAsBranch: (id: string) => void;
  onDecline: (id: string) => void;
}

const actionButton =
  'inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 font-heading text-sm leading-tight transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';
const secondary = `${actionButton} border border-border text-text-primary hover:bg-surface-secondary`;

const closedTag = {
  approved: { label: 'Approved', cls: 'bg-accent-2-100 text-accent-2-800' },
  rejected: { label: 'Declined', cls: 'bg-neutral-100 text-neutral-800' },
  applied: { label: 'Applied', cls: 'bg-accent-2-100 text-accent-2-800' },
  branched: { label: 'Branched', cls: 'bg-accent-2-100 text-accent-2-800' },
  pending: { label: 'Open', cls: 'bg-accent-100 text-accent-800' },
} as const;

/** The note under the diff rows: the general edit, else the whys, else the old free-text message. */
function noteOf(s: Suggestion): string {
  const edits = s.edits ?? [];
  const general = edits.find((e) => e.kind === 'general');
  if (general) return general.to;
  const whys = edits.map((e) => e.why?.trim()).filter(Boolean);
  return whys.length ? whys.join(' ') : edits.length ? '' : s.message;
}

/**
 * The suggestions section under the recipe body. The owner's attention is kept
 * by the pending badge on More (RL-100), so this no longer sits above the body.
 */
export function SuggestionList({
  suggestions,
  isOwner,
  reviewingId,
  reviewError,
  onApply,
  onKeepAsBranch,
  onDecline,
}: SuggestionListProps) {
  const [declining, setDeclining] = useState<{ id: string; message: string } | null>(null);
  // Which button was pressed, so "Working…" shows on that one only.
  const [pressed, setPressed] = useState<'apply' | 'branch' | 'decline'>('apply');
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const working = (id: string, kind: typeof pressed) => reviewingId === id && pressed === kind;
  const navigate = useNavigate();
  const alertRef = useRef<HTMLParagraphElement>(null);
  // A failed review leaves focus on a disabled or closed control; move it to the message.
  useEffect(() => {
    if (!reviewError) return;
    alertRef.current?.focus();
    alertRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [reviewError]);
  if (suggestions.length === 0) return null;
  const nameOf = (s: Suggestion) => s.suggestedBy.displayName || 'Someone';

  const open = suggestions.filter((s) => s.status === 'pending');
  const closed = suggestions.filter((s) => s.status !== 'pending');
  const counts = [
    open.length > 0 && `${open.length} open`,
    closed.length > 0 && `${closed.length} closed`,
  ]
    .filter(Boolean)
    .join(' · ');
  // Replies, Reply and closed rows open the thread screen (RL-106).
  const openThread = (s: Suggestion) => navigate(`/recipe/${s.recipeId}/suggestion/${s.id}`);

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
        <p ref={alertRef} tabIndex={-1} role="alert" className="mb-2 text-xs text-danger-600 focus:outline-none">
          {reviewError}
        </p>
      )}
      <div className="space-y-3">
        {open.map((s) => (
          <div key={s.id} aria-busy={reviewingId === s.id} className="flex flex-col gap-2.5 rounded-[28px] bg-surface p-3.5 shadow-md">
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
            {(s.edits ?? []).map((e, i) => (
              <SuggestionDiffRow key={i} edit={e} />
            ))}
            <p className="break-words text-sm text-text-primary">{noteOf(s) || '(No message)'}</p>
            <Link
              to={`/recipe/${s.recipeId}/suggestion/${s.id}`}
              className="inline-flex min-h-11 items-center gap-1 self-start text-[13px] font-semibold text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              {isOwner ? 'Replies' : 'Reply'}
            </Link>
            {isOwner && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPressed('decline');
                    setDeclining({ id: s.id, message: s.message });
                  }}
                  disabled={reviewingId !== null}
                  aria-label={working(s.id, 'decline') ? 'Working…' : `Decline suggestion from ${nameOf(s)}`}
                  className={`${secondary} ${working(s.id, 'decline') ? '!px-1' : ''}`}
                >
                  {working(s.id, 'decline') ? 'Working…' : 'Decline'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPressed('apply');
                    onApply(s.id);
                  }}
                  disabled={reviewingId !== null}
                  aria-label={
                    working(s.id, 'apply')
                      ? 'Working…'
                      : `${hasApplicableEdits(s.edits ?? []) ? 'Apply' : 'Mark applied'} suggestion from ${nameOf(s)}`
                  }
                  className={`${actionButton} bg-primary-600 text-on-accent hover:bg-primary-700 ${working(s.id, 'apply') ? '!px-1' : ''}`}
                >
                  {working(s.id, 'apply') ? 'Working…' : hasApplicableEdits(s.edits ?? []) ? 'Apply' : 'Mark applied'}
                </button>
                {hasApplicableEdits(s.edits ?? []) && (
                  <button
                    type="button"
                    aria-label={working(s.id, 'branch') ? 'Working…' : `More options for ${nameOf(s)}'s suggestion`}
                    aria-haspopup="dialog"
                    onClick={() => setMoreFor(s.id)}
                    disabled={reviewingId !== null}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-surface-secondary disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  >
                    <Ellipsis className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {closed.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {closed.map((s) => {
            const tag = closedTag[s.status];
            const message = s.edits?.length ? describeEdit(s.edits[0]) : s.message || '(No message)';
            return (
              <div key={s.id}>
                <button
                  type="button"
                  onClick={() => (s.status === 'branched' && s.branchId ? navigate(`/recipe/${s.branchId}`) : openThread(s))}
                  aria-label={`${nameOf(s)}: ${message}, ${tag.label}${s.status === 'branched' && s.branchId ? ', opens branch' : ''}`}
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
              </div>
            );
          })}
        </div>
      )}
      <Sheet open={moreFor !== null} onClose={() => setMoreFor(null)} labelledBy="suggestion-more-title">
        <h2 id="suggestion-more-title" className="sr-only">
          More options
        </h2>
        <button
          type="button"
          onClick={() => {
            const id = moreFor;
            setMoreFor(null);
            setPressed('branch');
            if (id) onKeepAsBranch(id);
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 py-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <GitBranch className="h-5 w-5 shrink-0" />
          Keep as branch
        </button>
      </Sheet>
      <DeclineSuggestionDialog
        message={declining?.message ?? null}
        onConfirm={() => {
          const target = declining;
          setDeclining(null);
          if (target) onDecline(target.id);
        }}
        onCancel={() => setDeclining(null)}
      />
    </section>
  );
}

/** The Decline confirmation, shared with the thread page so both read the same. Open while `message` is set. */
export function DeclineSuggestionDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={message !== null}
      title="Decline this suggestion?"
      message={
        message !== null
          ? `"${message}" will be marked declined and the suggester will be notified. This can't be undone.`
          : ''
      }
      confirmLabel="Decline"
      confirmVariant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
