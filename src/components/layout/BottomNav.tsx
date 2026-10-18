import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { BookOpen, Settings, User } from '../ui/icons';

// Profile was reachable only through a 20px avatar in the library header, which
// made the account-recovery prompt living there effectively hidden.
const navItems = [
  { to: '/', label: 'Library', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-40">
      <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-4 py-1.5 text-xs transition-colors',
                isActive ? 'text-primary-600 dark:text-primary-400' : 'text-text-secondary'
              )
            }
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
