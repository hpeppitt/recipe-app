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
      {/* The 78px bar plus its safe-area growth, plus 8px of air. At lg the nav is a rail, so no bottom padding and a 220px left margin. */}
      <main className="flex-1 pb-[calc(78px_+_max(8px,env(safe-area-inset-bottom)))] lg:ml-[220px] lg:pb-0">
        {/* Above the outlet, not inside a page: the sign-in link that triggers a
            migration can land the user on any of the shell's routes. */}
        <EmailLinkStatus />
        {/* Keeps the nav alive when a shell page throws. */}
        <RouteErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            {/* RL-116 replaces this single centred column with the two-pane layout. */}
            <div className="lg:max-w-lg lg:mx-auto">
              <Outlet />
            </div>
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
