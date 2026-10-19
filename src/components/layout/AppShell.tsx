import { lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ConsentBanner } from './ConsentBanner';
import { clearLeftoverGaCookies } from '../../services/analytics';
import { ErrorBoundary, RouteErrorBoundary } from '../ui/ErrorBoundary';
import { PageFallback } from '../ui/PageFallback';
import { EmailLinkStatus } from '../auth/EmailLinkStatus';
import { RecipePaneContext } from '../../contexts/RecipePaneContext';

const RecipeDetailPage = lazy(() => import('../../pages/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })));

export function AppShell() {
  useEffect(clearLeftoverGaCookies, []);
  // Set only at lg and up when a recipe was opened from Explore or Saved (RL-116).
  const recipeId = useContext(RecipePaneContext);
  const paneRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // Read out politely when the pane shows a recipe; focus stays on the row that was chosen.
  const [shownTitle, setShownTitle] = useState('');
  // RecipeDetailPage stays mounted across ids, so a newly chosen recipe starts at its top.
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [recipeId]);
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
            {/* The list keeps the same elements in both layouts, so selecting a recipe never
                remounts it; it scrolls with the window, which keeps its place across Back. */}
            <div className={recipeId ? 'flex items-start' : undefined}>
              <div
                role={recipeId ? 'region' : undefined}
                aria-label={recipeId ? 'Recipe list' : undefined}
                className={recipeId ? 'min-h-dvh w-[420px] shrink-0 pt-3 shadow-[1px_0_0_var(--color-border)]' : 'lg:max-w-lg lg:mx-auto'}
              >
                <Outlet />
              </div>
              {recipeId && (
                <div
                  ref={paneRef}
                  role="region"
                  aria-label="Recipe"
                  className="@container sticky top-0 h-dvh min-w-0 flex-1 overflow-y-auto overscroll-contain"
                >
                  <p role="status" className="sr-only">{shownTitle && `Showing ${shownTitle}`}</p>
                  {/* Its own boundaries, so a failing recipe or its first chunk load leaves the list alone.
                      Reset on the id, since the pathname (the list's) does not change between recipes.
                      "Back to library" still goes to /. */}
                  <ErrorBoundary resetKey={recipeId} onBack={() => navigate('/')}>
                    <Suspense fallback={<PageFallback />}>
                      <RecipeDetailPage id={recipeId} onShown={setShownTitle} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
