import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './pages/LibraryPage';
import { RecipeChatPage } from './pages/RecipeChatPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { RecipeEditPage } from './pages/RecipeEditPage';
import { VersionTreePage } from './pages/VersionTreePage';
import { SettingsPage } from './pages/SettingsPage';
import { SharedRecipePage } from './pages/SharedRecipePage';
import { ProfilePage } from './pages/ProfilePage';
import { useTheme } from './hooks/useTheme';

export default function App() {
  useTheme();

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryPage />} />
            {/* Own profile is a top-level destination now that it has a nav tab;
                without this the tab would lead somewhere with no way back to it.
                Public profiles stay outside the shell — they are a detail view
                reached from a recipe, and they carry their own back button. */}
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/create" element={<RecipeChatPage />} />
          <Route path="/recipe/:id/vary" element={<RecipeChatPage />} />
          <Route path="/recipe/:id" element={<RecipeDetailPage />} />
          <Route path="/recipe/:id/edit" element={<RecipeEditPage />} />
          <Route path="/recipe/:id/tree" element={<VersionTreePage />} />
          <Route path="/shared" element={<SharedRecipePage />} />
          <Route path="/shared/:id" element={<SharedRecipePage />} />
          <Route path="/profile/:uid" element={<ProfilePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
