import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './pages/LibraryPage';
import { RecipeChatPage } from './pages/RecipeChatPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
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
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/create" element={<RecipeChatPage />} />
          <Route path="/recipe/:id/vary" element={<RecipeChatPage />} />
          <Route path="/recipe/:id" element={<RecipeDetailPage />} />
          <Route path="/recipe/:id/tree" element={<VersionTreePage />} />
          <Route path="/shared" element={<SharedRecipePage />} />
          <Route path="/shared/:id" element={<SharedRecipePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:uid" element={<ProfilePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
