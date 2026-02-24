import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './pages/LibraryPage';
import { RecipeChatPage } from './pages/RecipeChatPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { VersionTreePage } from './pages/VersionTreePage';
import { SettingsPage } from './pages/SettingsPage';
import { SharedRecipePage } from './pages/SharedRecipePage';
import { useTheme } from './hooks/useTheme';

export default function App() {
  useTheme();

  return (
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
      </Routes>
    </BrowserRouter>
  );
}
