import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import { timeAgo } from '../../lib/utils';

// Keyed maps rather than a growing ternary chain: four types made the inline
// conditional unreadable, and an unknown type now falls back instead of
// silently rendering as a suggestion.
const NOTIF_ICONS: Record<string, string> = {
  favorite: '❤️',
  suggestion: '💡',
  suggestion_approved: '✅',
  suggestion_rejected: '🙏',
  suggestion_reply: '💬',
  follow: '👤',
};

const NOTIF_VERBS: Record<string, string> = {
  favorite: 'favorited your recipe',
  suggestion: 'suggested a change to',
  suggestion_approved: 'approved your suggestion on',
  suggestion_rejected: 'passed on your suggestion for',
  // Works in both directions: the owner and the suggester each receive this when
  // the other replies, so the verb cannot assume which side is reading.
  suggestion_reply: 'replied about',
  follow: 'started following you',
};

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleNotificationClick = async (notif: (typeof notifications)[0]) => {
    if (!notif.read) await markRead(notif.id);
    setOpen(false);
    // A follow is about a person, so it leads to their profile. Sending it to
    // /recipe/undefined would have been a dead end.
    navigate(notif.recipeId ? `/recipe/${notif.recipeId}` : `/profile/${notif.fromUid}`);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition-colors relative"
        // The count is painted into a badge, which is invisible to a screen
        // reader unless it is part of the button's name.
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg
          className="w-5 h-5 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {/* Badge is positioned against the 20px icon, not the 44px hit area, so
            the larger touch target doesn't push it out to the corner. */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger-600 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/*
        A fixed 20rem panel anchored to the bell overflowed the left edge on narrow
        phones. Below sm it spans the viewport with 1rem insets instead, so clipping
        is impossible regardless of where the bell sits; the anchored dropdown
        returns at sm and up. top-16 clears the h-14 sticky header.
      */}
      {open && (
        <div className="fixed inset-x-4 top-16 max-h-96 overflow-y-auto bg-surface border border-border rounded-2xl shadow-xl z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="min-h-11 px-2 -mr-2 text-xs text-primary-600 dark:text-primary-400 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="px-4 py-8 flex items-center justify-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm text-text-tertiary">Loading...</span>
            </div>
          ) : error ? (
            // Distinct from empty: "nothing here" and "we couldn't check" are
            // very different messages to send a creator.
            <div className="px-4 py-6 text-center space-y-1">
              <p className="text-sm font-medium text-text-primary">
                Couldn't load notifications
              </p>
              <p className="text-xs text-text-secondary">
                The connection failed. Reopen this to try again.
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              No notifications yet
            </div>
          ) : (
            <div className="py-1">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-secondary transition-colors ${
                    !notif.read ? 'bg-primary-50/50 dark:bg-primary-950/50' : ''
                  }`}
                >
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 mt-0.5">
                      {notif.fromUid ? (
                        <Avatar uid={notif.fromUid} name={notif.fromDisplayName} size="sm" />
                      ) : (
                        <span className="text-lg">{NOTIF_ICONS[notif.type] ?? '💡'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        <strong>{notif.fromDisplayName ?? 'Someone'}</strong>{' '}
                        {NOTIF_VERBS[notif.type] ?? 'suggested a change to'}
                        {/* Follow notifications carry no recipe, so the trailing
                            title is omitted rather than rendering "undefined". */}
                        {notif.recipeTitle && (
                          <>
                            {' '}
                            <strong>
                              {notif.recipeEmoji} {notif.recipeTitle}
                            </strong>
                          </>
                        )}
                      </p>
                      {notif.message && (
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">
                          "{notif.message}"
                        </p>
                      )}
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {timeAgo(notif.createdAt)}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
