import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { ExplorePage } from './pages/ExplorePage';
import { RouteErrorBoundary } from './components/ui/ErrorBoundary';
import { PageFallback } from './components/ui/PageFallback';
import { UpdatePrompt } from './components/layout/UpdatePrompt';
import { TermsGate } from './components/auth/TermsUpdateDialog';
import { EmailLinkStatus } from './components/auth/EmailLinkStatus';
import { useTheme } from './hooks/useTheme';
import { useOwnRecipesSync } from './hooks/useOwnRecipesSync';
import { paneMode } from './lib/paneMode';
import { RecipePaneContext } from './contexts/RecipePaneContext';

// Explore stays eager so first paint is unchanged; every other page is its own chunk.
const RecipeChatPage = lazy(() => import('./pages/RecipeChatPage').then(m => ({ default: m.RecipeChatPage })));
const RecipeDetailPage = lazy(() => import('./pages/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })));
const RecipeEditPage = lazy(() => import('./pages/RecipeEditPage').then(m => ({ default: m.RecipeEditPage })));
const VersionTreePage = lazy(() => import('./pages/VersionTreePage').then(m => ({ default: m.VersionTreePage })));
const RecipeChangesPage = lazy(() => import('./pages/RecipeChangesPage').then(m => ({ default: m.RecipeChangesPage })));
const CookModePage = lazy(() => import('./pages/CookModePage').then(m => ({ default: m.CookModePage })));
const TastePage = lazy(() => import('./pages/TastePage').then(m => ({ default: m.TastePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const CookLogPage = lazy(() => import('./pages/CookLogPage').then(m => ({ default: m.CookLogPage })));
const SharedRecipePage = lazy(() => import('./pages/SharedRecipePage').then(m => ({ default: m.SharedRecipePage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const SavedPage = lazy(() => import('./pages/SavedPage').then(m => ({ default: m.SavedPage })));
const KitchenPage = lazy(() => import('./pages/KitchenPage').then(m => ({ default: m.KitchenPage })));
const PantryPage = lazy(() => import('./pages/PantryPage').then(m => ({ default: m.PantryPage })));
const CollectionPage = lazy(() => import('./pages/CollectionPage').then(m => ({ default: m.CollectionPage })));
const ShoppingListPage = lazy(() => import('./pages/ShoppingListPage').then(m => ({ default: m.ShoppingListPage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityPage })));
const SuggestionThreadPage = lazy(() => import('./pages/SuggestionThreadPage').then(m => ({ default: m.SuggestionThreadPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const CreatePage = lazy(() => import('./pages/CreatePage').then(m => ({ default: m.CreatePage })));
const ForestPage = lazy(() => import('./pages/ForestPage').then(m => ({ default: m.ForestPage })));
const ImportPage = lazy(() => import('./pages/ImportPage').then(m => ({ default: m.ImportPage })));
const JoinKitchenPage = lazy(() => import('./pages/JoinKitchenPage').then(m => ({ default: m.JoinKitchenPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));

// Mounted beside the routes so the own-recipes listener covers every page (RL-078).
function OwnRecipesSync() {
  useOwnRecipesSync();
  return null;
}

/**
 * The route table. A recipe opened from a list (Explore, Saved, Kitchen) renders the shell against the
 * list's location at every width, so the list and the recipe are the same elements on
 * both sides of lg: AppShell shows them side by side from lg (RL-116) and the recipe alone
 * below it, and a resize changes only the layout (2026-10-20). Everywhere else it is the
 * plain table.
 */
export function AppRoutes() {
  const location = useLocation();
  const pane = paneMode(location.pathname, location.state, true);
  return (
    <RecipePaneContext.Provider value={pane?.recipeId ?? null}>
      <Routes location={pane ? { ...location, pathname: pane.listPath } : location}>
        <Route element={<AppShell />}>
          <Route path="/" element={<ExplorePage />} />
          {/* Search (RL-124) keeps the Explore tab highlighted, so it stays in the shell. */}
          <Route path="/search" element={<SearchPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/kitchen" element={<KitchenPage />} />
          <Route path="/new" element={<CreatePage />} />
          <Route path="/activity" element={<ActivityPage />} />
          {/* Own profile is a top-level destination now that it has a nav tab;
              without this the tab would lead somewhere with no way back to it.
              Public profiles stay outside the shell: they are a detail view
              reached from a recipe, and they carry their own back button. */}
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        {/* Reached from the You tab's gear and has its own Back button (RL-097). */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/taste" element={<TastePage />} />
        {/* Kitchen's own pages carry their own Back button, so below lg the shell shows no chrome
            around them; they are in the shell so a recipe can open beside them from lg (RL-225). */}
        <Route element={<AppShell bare />}>
          <Route path="/kitchen/list" element={<ShoppingListPage />} />
          <Route path="/kitchen/c/:id" element={<CollectionPage />} />
          <Route path="/kitchen/pantry" element={<PantryPage />} />
          {/* Cook log (RL-200): takes its final name now so Kitchen only adds a tile. */}
          <Route path="/kitchen/log" element={<CookLogPage />} />
        </Route>
        <Route path="/create" element={<RecipeChatPage />} />
        {/* Add from a link (RL-186), gated like /create, with its own Close button. */}
        <Route path="/import" element={<ImportPage />} />
        <Route path="/recipe/:id/vary" element={<RecipeChatPage />} />
        <Route path="/recipe/:id" element={<RecipeDetailPage />} />
        <Route path="/recipe/:id/edit" element={<RecipeEditPage />} />
        <Route path="/recipe/:id/tree" element={<VersionTreePage />} />
        {/* Cook mode (RL-203): full screen, so Back closes it. */}
        <Route path="/recipe/:id/cook" element={<CookModePage />} />
        <Route path="/recipe/:id/changes" element={<RecipeChangesPage />} />
        {/* The reply thread on one suggestion (RL-106), with its own Back button. */}
        <Route path="/recipe/:id/suggestion/:suggestionId" element={<SuggestionThreadPage />} />
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        <Route path="/cookies" element={<LegalPage doc="cookies" />} />
        {/* A kitchen invite (RL-239): a sheet over a plain ground, outside the shell. */}
        <Route path="/join/:code" element={<JoinKitchenPage />} />
        <Route path="/shared" element={<SharedRecipePage />} />
        <Route path="/shared/:id" element={<SharedRecipePage />} />
        {/* 4b Forest view (RL-175), with its own Back button like /settings. */}
        <Route path="/profile/forest" element={<ForestPage />} />
        <Route path="/profile/:uid/forest" element={<ForestPage />} />
        <Route path="/profile/:uid" element={<ProfilePage />} />
      </Routes>
    </RecipePaneContext.Provider>
  );
}

export default function App() {
  useTheme();

  return (
    <AuthProvider>
      <BrowserRouter>
        <RouteErrorBoundary>
        <Suspense fallback={<PageFallback />}>
        <AppRoutes />
        </Suspense>
        </RouteErrorBoundary>
        <UpdatePrompt />
        {/* Inside the router so it can stay off the policy pages (RL-047). */}
        <TermsGate />
        {/* Once, at the root: the sign-in link returns to whichever page asked for it (RL-135). */}
        <EmailLinkStatus />
        <OwnRecipesSync />
      </BrowserRouter>
    </AuthProvider>
  );
}
