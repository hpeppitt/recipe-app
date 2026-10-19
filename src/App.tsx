import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { ExplorePage } from './pages/ExplorePage';
import { RouteErrorBoundary } from './components/ui/ErrorBoundary';
import { PageFallback } from './components/ui/PageFallback';
import { UpdatePrompt } from './components/layout/UpdatePrompt';
import { TermsGate } from './components/auth/TermsUpdateDialog';
import { useTheme } from './hooks/useTheme';
import { useOwnRecipesSync } from './hooks/useOwnRecipesSync';

// Explore stays eager so first paint is unchanged; every other page is its own chunk.
const RecipeChatPage = lazy(() => import('./pages/RecipeChatPage').then(m => ({ default: m.RecipeChatPage })));
const RecipeDetailPage = lazy(() => import('./pages/RecipeDetailPage').then(m => ({ default: m.RecipeDetailPage })));
const RecipeEditPage = lazy(() => import('./pages/RecipeEditPage').then(m => ({ default: m.RecipeEditPage })));
const VersionTreePage = lazy(() => import('./pages/VersionTreePage').then(m => ({ default: m.VersionTreePage })));
const RecipeChangesPage = lazy(() => import('./pages/RecipeChangesPage').then(m => ({ default: m.RecipeChangesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SharedRecipePage = lazy(() => import('./pages/SharedRecipePage').then(m => ({ default: m.SharedRecipePage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })));
const SavedPage = lazy(() => import('./pages/SavedPage').then(m => ({ default: m.SavedPage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityPage })));
const SuggestionThreadPage = lazy(() => import('./pages/SuggestionThreadPage').then(m => ({ default: m.SuggestionThreadPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));

// Mounted beside the routes so the own-recipes listener covers every page (RL-078).
function OwnRecipesSync() {
  useOwnRecipesSync();
  return null;
}

export default function App() {
  useTheme();

  return (
    <AuthProvider>
      <BrowserRouter>
        <RouteErrorBoundary>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ExplorePage />} />
            {/* Search (RL-124) keeps the Explore tab highlighted, so it stays in the shell. */}
            <Route path="/search" element={<SearchPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            {/* Own profile is a top-level destination now that it has a nav tab;
                without this the tab would lead somewhere with no way back to it.
                Public profiles stay outside the shell — they are a detail view
                reached from a recipe, and they carry their own back button. */}
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          {/* Reached from the You tab's gear and has its own Back button (RL-097). */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/create" element={<RecipeChatPage />} />
          <Route path="/recipe/:id/vary" element={<RecipeChatPage />} />
          <Route path="/recipe/:id" element={<RecipeDetailPage />} />
          <Route path="/recipe/:id/edit" element={<RecipeEditPage />} />
          <Route path="/recipe/:id/tree" element={<VersionTreePage />} />
          <Route path="/recipe/:id/changes" element={<RecipeChangesPage />} />
          {/* The reply thread on one suggestion (RL-106), with its own Back button. */}
          <Route path="/recipe/:id/suggestion/:suggestionId" element={<SuggestionThreadPage />} />
          <Route path="/terms" element={<LegalPage doc="terms" />} />
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/cookies" element={<LegalPage doc="cookies" />} />
          <Route path="/shared" element={<SharedRecipePage />} />
          <Route path="/shared/:id" element={<SharedRecipePage />} />
          <Route path="/profile/:uid" element={<ProfilePage />} />
        </Routes>
        </Suspense>
        </RouteErrorBoundary>
        <UpdatePrompt />
        {/* Inside the router so it can stay off the policy pages (RL-047). */}
        <TermsGate />
        <OwnRecipesSync />
      </BrowserRouter>
    </AuthProvider>
  );
}
