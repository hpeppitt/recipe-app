import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { Avatar } from '../ui/Avatar';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
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
    navigate(`/recipe/${notif.recipeId}`);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors relative"
        aria-label="Notifications"
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
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-surface border border-border rounded-2xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary-600 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
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
                    !notif.read ? 'bg-primary-50/50' : ''
                  }`}
                >
                  <div className="flex gap-2.5">
                    <div className="flex-shrink-0 mt-0.5">
                      {notif.fromUid ? (
                        <Avatar uid={notif.fromUid} name={notif.fromDisplayName} size="sm" />
                      ) : (
                        <span className="text-lg">{notif.type === 'favorite' ? '❤️' : '💡'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        {notif.type === 'favorite' ? (
                          <>
                            <strong>{notif.fromDisplayName ?? 'Someone'}</strong>{' '}
                            favorited your recipe{' '}
                            <strong>{notif.recipeEmoji} {notif.recipeTitle}</strong>
                          </>
                        ) : (
                          <>
                            <strong>{notif.fromDisplayName ?? 'Someone'}</strong>{' '}
                            suggested a change to{' '}
                            <strong>{notif.recipeEmoji} {notif.recipeTitle}</strong>
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
