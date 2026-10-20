import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { groupByDay, NOTIF_VERBS } from '../lib/notifications';
import { timeAgo } from '../lib/utils';
import { AuthModal } from '../components/auth/AuthModal';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Bell, Check, GitBranch, Heart, MessageCircle, UserPlus, X } from '../components/ui/icons';
import type { AppNotification } from '../types/social';

const BADGES: Record<AppNotification['type'], { tint: string; Icon: typeof Bell }> = {
  suggestion: { tint: 'bg-accent', Icon: MessageCircle },
  suggestion_reply: { tint: 'bg-accent', Icon: MessageCircle },
  suggestion_approved: { tint: 'bg-accent-2-600', Icon: Check },
  suggestion_rejected: { tint: 'bg-neutral-700', Icon: X },
  suggestion_applied: { tint: 'bg-accent-2-600', Icon: Check },
  suggestion_branched: { tint: 'bg-accent-2-600', Icon: GitBranch },
  follow: { tint: 'bg-neutral-700', Icon: UserPlus },
  favorite: { tint: 'bg-neutral-700', Icon: Heart },
};

/** The notifications as an Organic feed grouped into Today and Earlier (RL-092). */
export function ActivityPage() {
  const { user, isConfigured } = useAuth();
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);

  const open = async (n: AppNotification) => {
    if (!n.read) await markRead(n.id);
    // A follow is about a person; there is no recipe to open.
    navigate(n.recipeId ? `/recipe/${n.recipeId}` : `/profile/${n.fromUid}`);
  };

  const readAll = async () => {
    setMarkFailed(false);
    try {
      await markAllRead();
    } catch {
      setMarkFailed(true);
    }
  };

  const { today, earlier } = groupByDay(notifications);
  const signedOut = !isConfigured || !user || !user.emailVerified;

  const row = (n: AppNotification) => {
    const { tint, Icon } = BADGES[n.type] ?? BADGES.suggestion;
    const who = n.fromDisplayName?.trim() || 'Someone';
    const message = n.message?.trim();
    // Suggestions read "Sami: <change>"; outcomes read the bare message; the rest stay quoted (RL-151).
    const detail = !message
      ? null
      : n.type === 'suggestion'
        ? `${who.split(/\s+/)[0]}: ${message}`
        : n.type === 'suggestion_applied' || n.type === 'suggestion_branched'
          ? message
          : `"${message}"`;
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => open(n)}
          aria-labelledby={`n-${n.id}-text${n.read ? '' : ` n-${n.id}-unread`}`}
          aria-describedby={`n-${n.id}-detail`}
          className="flex min-h-11 w-full items-start gap-3 py-2.5 text-left"
        >
          <span className="relative shrink-0 [&>div]:size-10 [&>div]:text-sm">
            <Avatar uid={n.fromUid} name={n.fromDisplayName} size="lg" />
            <span
              aria-hidden="true"
              className={`absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full text-on-accent ring-2 ring-surface ${tint}`}
            >
              <Icon className="size-2.5" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span id={`n-${n.id}-text`} className="block break-words text-sm leading-[1.4] text-text-primary">
              <b>{who}</b> {NOTIF_VERBS[n.type] ?? NOTIF_VERBS.suggestion}
              {n.recipeTitle && (
                <>
                  {' '}
                  <b>
                    {n.recipeEmoji} {n.recipeTitle}
                  </b>
                </>
              )}
            </span>
            <span id={`n-${n.id}-detail`} className="mt-0.5 flex gap-1 text-xs text-text-tertiary">
              {detail && <span className="min-w-0 truncate">{detail}</span>}
              <span className="shrink-0">
                <span aria-hidden="true">{detail ? '\u00b7 ' : ''}</span>
                {timeAgo(n.createdAt)}
              </span>
            </span>
          </span>
          {!n.read && (
            <span className="mt-2 size-[9px] shrink-0 rounded-full bg-accent">
              <span id={`n-${n.id}-unread`} className="sr-only">
                unread
              </span>
            </span>
          )}
        </button>
      </li>
    );
  };

  const group = (label: string, items: AppNotification[], top: string) =>
    items.length > 0 && (
      <section>
        <h2 className={`${top} mb-1 text-xs font-semibold text-text-tertiary`}>{label}</h2>
        <ul>{items.map(row)}</ul>
      </section>
    );

  return (
    <div>
      <div className="flex items-baseline px-5 pt-4">
        <h1 className="flex-1 font-heading text-[30px] leading-tight text-text-primary">Activity</h1>
        {!signedOut && unreadCount > 0 && (
          <button
            type="button"
            onClick={readAll}
            className="min-h-11 text-[13px] font-semibold text-accent-700"
          >
            Mark all read
          </button>
        )}
      </div>
      {markFailed && (
        <p role="alert" className="px-5 text-sm text-danger-600">
          Couldn't mark those as read. Try again.
        </p>
      )}
      {signedOut ? (
        <>
          <EmptyState
            icon={<Bell />}
            title="Nothing to see yet"
            description="Sign in and this is where suggestions on your recipes, replies and new followers show up."
            action={isConfigured ? <Button onClick={() => setShowAuth(true)}>Sign in</Button> : undefined}
          />
          <AuthModal open={showAuth} action={{ kind: 'continue' }} onAuthenticated={() => setShowAuth(false)} onDismiss={() => setShowAuth(false)} />
        </>
      ) : isLoading ? (
        <div className="flex flex-col gap-3 px-5 pt-4" role="status" aria-label="Loading notifications">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-[20px]" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={<Bell />}
          title="Couldn't load notifications"
          description="The connection failed. Reopen this to try again."
        />
      ) : notifications.length === 0 ? (
        <p className="px-5 py-5 text-sm text-text-tertiary">Nothing here yet.</p>
      ) : (
        <div className="px-5 pt-2.5">
          {group('Today', today, 'mt-2.5')}
          {group('Earlier', earlier, 'mt-3.5')}
        </div>
      )}
    </div>
  );
}
