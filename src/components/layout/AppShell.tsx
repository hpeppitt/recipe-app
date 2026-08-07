import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { StrandedIdentityNotice } from '../auth/StrandedIdentityNotice';
import { EmailLinkStatus } from '../auth/EmailLinkStatus';

export function AppShell() {
  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <main className="flex-1 pb-16">
        {/* Above the outlet, not inside a page: the sign-in link that triggers a
            migration can land the user on any of the shell's three routes. */}
        {/* Sign-in outcome first: it is the thing the user just did, and it can
            explain why the notice below it is showing. */}
        <EmailLinkStatus />
        <StrandedIdentityNotice />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
