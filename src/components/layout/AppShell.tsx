import { lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ConsentBanner } from './ConsentBanner';
import { clearLeftoverGaCookies } from '../../services/analytics';
import { ErrorBoundary, RouteErrorBoundary } from '../ui/ErrorBoundary';
import { PageFallback } from '../ui/PageFallback';
import { RecipePaneContext } from '../../contexts/RecipePaneContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { WIDE_QUERY } from '../../lib/paneMode';

const RecipeDetailPage = lazy(() => import('../../pages/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })));

export function AppShell() {
  useEffect(clearLeftoverGaCookies, []);
  // Set when a recipe was opened from Explore or Saved (RL-116), at any width.
  const recipeId = useContext(RecipePaneContext);
  const wide = useMediaQuery(WIDE_QUERY);
  // Side by side from lg; below it the recipe fills the screen as its own route did. One tree for
  // both, so a resize across 1024px changes layout only and keeps every page's state (2026-10-20).
  const beside = recipeId !== null && wide;
  const alone = recipeId !== null && !wide;
  // When the window narrows beside a recipe the list stays mounted, hidden, so Back finds it as it
  // was. Cleared once the list shows again, so a row opened at narrow width unmounts it as before.
  const [track, setTrack] = useState({ wide, keepList: false });
  // Read out politely when the pane shows a recipe; focus stays on the row that was chosen.
  const [shownTitle, setShownTitle] = useState('');
  let keepList = track.keepList;
  if (track.wide !== wide || (keepList && recipeId === null)) {
    keepList = alone && (track.wide || keepList);
    setTrack({ wide, keepList });
    // Empty on return to wide, so the status mounts silent and holds no stale title.
    if (!wide) setShownTitle('');
  }
  // Only beside the list, read at call time: below lg there is no status, so no shell render either.
  const onShown = useCallback((title: string) => {
    if (window.matchMedia?.(WIDE_QUERY).matches) setShownTitle(title);
  }, []);
  const showList = !alone || keepList;
  const paneRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // RecipeDetailPage stays mounted across ids, so a newly chosen recipe starts at its top.
  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [recipeId]);
  // Scroll offsets, read before a resize commits: the window's (the list beside a recipe, the
  // recipe alone), the pane's, and the hidden list's while it waits for Back.
  const windowY = useRef(0);
  const paneY = useRef(0);
  const listY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      windowY.current = window.scrollY;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Across 1024px the recipe's scroll moves between the window and the pane, and the list's back.
  const lastWide = useRef(wide);
  useLayoutEffect(() => {
    if (lastWide.current === wide) return;
    lastWide.current = wide;
    if (recipeId === null) return;
    if (wide) {
      if (paneRef.current) paneRef.current.scrollTop = windowY.current;
      window.scrollTo?.(0, listY.current);
      listY.current = 0;
    } else {
      listY.current = windowY.current;
      window.scrollTo?.(0, paneY.current);
    }
  }, [wide, recipeId]);
  // Back at narrow width after a resize: the kept list returns to where it was.
  useLayoutEffect(() => {
    if (recipeId === null && listY.current) {
      window.scrollTo?.(0, listY.current);
      listY.current = 0;
    }
  }, [recipeId]);
  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      {/* Below lg a recipe has the screen to itself, without the shell's chrome, as before RL-116. */}
      {!alone && <ConsentBanner />}
      {/* The 78px bar plus its safe-area growth, plus 8px of air. At lg the nav is a rail, so no bottom padding and a 220px left margin. */}
      <main className={alone ? 'flex-1' : 'flex-1 pb-[calc(78px_+_max(8px,env(safe-area-inset-bottom)))] lg:ml-[220px] lg:pb-0'}>
        {/* Keeps the nav alive when a shell page throws. */}
        <RouteErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            {/* The list keeps the same elements in both layouts, so selecting a recipe never
                remounts it; it scrolls with the window, which keeps its place across Back. */}
            <div className={beside ? 'flex items-start' : undefined}>
              {showList && (
                <div
                  hidden={alone}
                  role={beside ? 'region' : undefined}
                  aria-label={beside ? 'Recipe list' : undefined}
                  className={beside ? 'min-h-dvh w-[420px] shrink-0 pt-3 shadow-[1px_0_0_var(--color-border)]' : 'lg:max-w-lg lg:mx-auto'}
                >
                  <Outlet />
                </div>
              )}
              {recipeId && (
                <div
                  ref={paneRef}
                  role={beside ? 'region' : undefined}
                  aria-label={beside ? 'Recipe' : undefined}
                  onScroll={(e) => {
                    paneY.current = e.currentTarget.scrollTop;
                  }}
                  className={beside ? '@container sticky top-0 h-dvh min-w-0 flex-1 overflow-y-auto overscroll-contain' : undefined}
                >
                  {/* Only beside the list. It mounts empty on a resize, so the resize is not read out. */}
                  {beside && <p role="status" className="sr-only">{shownTitle && `Showing ${shownTitle}`}</p>}
                  {/* Its own boundaries, so a failing recipe or its first chunk load leaves the list alone.
                      Reset on the id, since the pathname (the list's) does not change between recipes.
                      "Back to library" still goes to /. */}
                  <ErrorBoundary resetKey={recipeId} onBack={() => navigate('/')}>
                    <Suspense fallback={<PageFallback />}>
                      <RecipeDetailPage id={recipeId} beside={wide} onShown={onShown} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </Suspense>
        </RouteErrorBoundary>
      </main>
      {!alone && <BottomNav />}
    </div>
  );
}
