import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ConsentBanner } from './ConsentBanner';
import { clearLeftoverGaCookies } from '../../services/analytics';
import { RouteErrorBoundary } from '../ui/ErrorBoundary';
import { PageFallback } from '../ui/PageFallback';
import { EmailLinkStatus } from '../auth/EmailLinkStatus';

export function AppShell() {
  useEffect(clearLeftoverGaCookies, []);
  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <ConsentBanner />
      {/* The 78px bar plus its safe-area growth, plus 8px of air. */}
      <main className="flex-1 pb-[calc(78px_+_max(8px,env(safe-area-inset-bottom)))]">
        {/* Above the outlet, not inside a page: the sign-in link that triggers a
            migration can land the user on any of the shell's routes. */}
        <EmailLinkStatus />
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
