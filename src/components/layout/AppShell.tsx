import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ConsentBanner } from './ConsentBanner';
import { clearLeftoverGaCookies } from '../../services/analytics';
import { StrandedIdentityNotice } from '../auth/StrandedIdentityNotice';
import { RouteErrorBoundary } from '../ui/ErrorBoundary';
import { PageFallback } from '../ui/PageFallback';
import { EmailLinkStatus } from '../auth/EmailLinkStatus';

export function AppShell() {
  useEffect(clearLeftoverGaCookies, []);
  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <ConsentBanner />
      <main className="flex-1 pb-16">
        {/* Above the outlet, not inside a page: the sign-in link that triggers a
            migration can land the user on any of the shell's three routes. */}
        {/* Sign-in outcome first: it is the thing the user just did, and it can
            explain why the notice below it is showing. */}
        <EmailLinkStatus />
        <StrandedIdentityNotice />
        {/* Keeps the nav alive when a shell page throws. */}
        <RouteErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
