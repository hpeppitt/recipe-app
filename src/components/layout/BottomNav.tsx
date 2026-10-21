import { useEffect, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { useCookbookUpdates } from '../../hooks/useCookbookUpdates';
import { db } from '../../db/database';
import { getKitchenTipDone, setKitchenTipDone } from '../../services/storage';
import { Bell, Compass, CookingPot, Plus, UserRound, X } from '../ui/icons';

/** Below 1024px a bottom bar; from lg a 220px left rail (RL-115). One element, CSS only. Bar height without the safe area is 78px; AppShell and UpdatePrompt use the same sum to clear it. */
const tabs = [
  { to: '/', label: 'Explore', icon: Compass },
  { to: '/kitchen', label: 'Kitchen', icon: CookingPot },
  { to: '/new', label: 'Create', icon: Plus },
  { to: '/activity', label: 'Activity', icon: Bell },
  { to: '/profile', label: 'You', icon: UserRound },
];

/** Five-slot Organic tab bar (RL-097). Settings is reached from the You tab's gear. */
export function BottomNav() {
  const { user, isConfigured } = useAuth();
  const { unreadCount: notificationCount } = useNotifications();
  const unreadCount = notificationCount + useCookbookUpdates().updates.length;
  const { pathname } = useLocation();
  // A plain Link with a computed state, because NavLink cannot mark Explore current on /search (RL-124)
  // or Kitchen on /saved, which is reached from Kitchen's Saved row (RL-215).
  const isCurrent = (to: string) =>
    !!matchPath(to, pathname) ||
    (to === '/' && !!matchPath('/search', pathname)) ||
    (to === '/kitchen' && (!!matchPath('/kitchen/*', pathname) || !!matchPath('/saved', pathname)));
  const showTip = useKitchenTip();
  const [tipClosed, setTipClosed] = useState(false);
  // Reaching Kitchen (a tap on the slot or a direct visit) answers the tip, so it stays gone after.
  if (showTip && !tipClosed && isCurrent('/kitchen')) setTipClosed(true);
  // ActivityPage lists nothing without a verified email, so a badge there would lead nowhere.
  const showBadge = isConfigured && !!user?.emailVerified && unreadCount > 0;

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface shadow-[0_-1px_0_var(--color-border)] px-3.5 pt-2 pb-[calc(max(8px,env(safe-area-inset-bottom))_+_14px)] lg:top-0 lg:right-auto lg:w-[220px] lg:bg-surface-secondary lg:shadow-none lg:px-4 lg:py-7"
    >
      {/* Rail wordmark (RL-115): plain text, not a link, so Explore stays the only link to / */}
      <p className="hidden lg:block font-heading text-[22px] px-3 pb-5 text-text-primary">Recipe Lab</p>
      <div className="relative flex items-center h-12 max-w-lg mx-auto lg:flex-col lg:items-stretch lg:h-auto lg:max-w-none lg:mx-0 lg:gap-1">
        {tabs.map(({ to, label, icon: Icon }) => {
          const create = to === '/new';
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
                'lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:h-11 lg:px-3.5 lg:rounded-full lg:text-sm lg:leading-5',
                isActive ? 'text-accent-700 lg:bg-surface' : 'text-text-tertiary lg:text-text-secondary'
              )}
            >
              <span
                className={cn(
                  'relative grid place-items-center rounded-full',
                  create ? 'w-11 h-11 bg-accent text-on-accent lg:w-[30px] lg:h-[30px] lg:bg-transparent lg:text-inherit' : 'w-[30px] h-[30px]'
                )}
              >
                <Icon className="w-[21px] h-[21px]" />
                {badge && (
                  <span
                    aria-hidden="true"
                    data-testid="activity-badge"
                    className="absolute -top-[3px] -right-2 min-w-[18px] h-[18px] px-[5px] grid place-items-center rounded-full bg-primary-600 text-on-accent text-[10px] font-bold leading-none shadow-[0_0_0_2px_var(--color-surface)] lg:shadow-[0_0_0_2px_var(--color-surface-secondary)]"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
        {showTip && !tipClosed && (
          // Bar: centred on the second of five slots (30%) when there is room, else flush with the row's left edge so it
          // never clips at 320px; 120px is about half the bubble. Rail: beside the second row (44px + 4px gap, centre 70px).
          <div
            role="status"
            className="absolute bottom-full mb-2.5 left-[max(0px,calc(30%-120px))] flex items-center gap-1 whitespace-nowrap rounded-full border border-accent-300 bg-accent-200 text-accent-900 pl-3.5 text-[13px] font-semibold shadow-sm lg:bottom-auto lg:mb-0 lg:left-full lg:top-[70px] lg:-translate-y-1/2 lg:ml-6"
          >
            Saved lives in Kitchen now
            <button
              type="button"
              onClick={() => setTipClosed(true)}
              aria-label="Close tip"
              className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-primary-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

/**
 * True once, for a returning user, the first time the nav mounts after Saved moved into Kitchen
 * (RL-215). Returning means any bookmark row on this device. Starts false, so nothing flashes
 * while Dexie answers, and the flag is written on the first answer either way, so a new user
 * who bookmarks later never sees it.
 */
function useKitchenTip(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (getKitchenTipDone()) return;
    let live = true;
    db.favorites
      .limit(1)
      .count()
      .then(
        (n) => {
          if (!live) return;
          setKitchenTipDone();
          setShow(n > 0);
        },
        () => {}
      );
    return () => {
      live = false;
    };
  }, []);
  return show;
}
