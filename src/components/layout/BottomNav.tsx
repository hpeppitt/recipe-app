import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { Bell, Bookmark, Compass, Plus, UserRound } from '../ui/icons';

/** Bar height without the safe area is 78px; AppShell and UpdatePrompt use the same sum to clear it. */
const tabs = [
  { to: '/', label: 'Explore', icon: Compass },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/create', label: 'Create', icon: Plus },
  { to: '/activity', label: 'Activity', icon: Bell },
  { to: '/profile', label: 'You', icon: UserRound },
];

/** Five-slot Organic tab bar (RL-097). Settings is reached from the You tab's gear. */
export function BottomNav() {
  const { user, isConfigured } = useAuth();
  const { unreadCount } = useNotifications();
  const { pathname } = useLocation();
  // A plain Link with a computed state, because NavLink cannot mark Explore current on /search (RL-124).
  const isCurrent = (to: string) => !!matchPath(to, pathname) || (to === '/' && !!matchPath('/search', pathname));
  // ActivityPage lists nothing without a verified email, so a badge there would lead nowhere.
  const showBadge = isConfigured && !!user?.emailVerified && unreadCount > 0;

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface shadow-[0_-1px_0_var(--color-border)] px-3.5 pt-2 pb-[calc(max(8px,env(safe-area-inset-bottom))_+_14px)]"
    >
      <div className="flex items-center h-12 max-w-lg mx-auto">
        {tabs.map(({ to, label, icon: Icon }) => {
          const create = to === '/create';
          const badge = to === '/activity' && showBadge;
          const isActive = isCurrent(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              aria-label={badge ? `${label}, ${unreadCount} unread` : undefined}
              className={cn(
                'flex-1 min-w-0 min-h-11 flex flex-col items-center justify-center gap-0.5 text-[11px] leading-[14px] font-semibold',
                // Create opens the chat full screen, so it never shows as the current tab.
                isActive && !create ? 'text-accent-700' : 'text-text-tertiary'
              )}
            >
              <span
                className={cn(
                  'relative grid place-items-center rounded-full',
                  create ? 'w-11 h-11 bg-accent text-on-accent' : 'w-[30px] h-[30px]'
                )}
              >
                <Icon className="w-[21px] h-[21px]" />
                {badge && (
                  <span
                    aria-hidden="true"
                    data-testid="activity-badge"
                    className="absolute -top-[3px] -right-2 min-w-[18px] h-[18px] px-[5px] grid place-items-center rounded-full bg-primary-600 text-on-accent text-[10px] font-bold leading-none shadow-[0_0_0_2px_var(--color-surface)]"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
