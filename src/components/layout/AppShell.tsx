import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { StrandedIdentityNotice } from '../auth/StrandedIdentityNotice';

export function AppShell() {
  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <main className="flex-1 pb-16">
        {/* Above the outlet, not inside a page: the sign-in link that triggers a
            migration can land the user on any of the shell's three routes. */}
        <StrandedIdentityNotice />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
