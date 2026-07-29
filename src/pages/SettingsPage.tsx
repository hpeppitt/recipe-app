import { useState } from 'react';
import { exportAllRecipes, importRecipes, clearAllRecipes } from '../db/recipes';
import { describeImport } from '../lib/import';
import { pluralize } from '../lib/utils';
import { useTheme } from '../hooks/useTheme';
import { useUnitSystem } from '../hooks/useUnitSystem';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { APP_NAME } from '../lib/constants';
import { TopBar } from '../components/layout/TopBar';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function SettingsPage() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // Export wrote a file and said nothing, so on a phone — where the download
  // lands out of sight — it was indistinguishable from a dead button.
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const { unitSystem, setUnitSystem } = useUnitSystem();
  const { user, isConfigured } = useAuth();
  const navigate = useNavigate();

  const handleExport = async () => {
    setExportStatus(null);
    const recipes = await exportAllRecipes();
    const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe-lab-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus(
      recipes.length > 0
        ? `Exported ${recipes.length} ${pluralize(recipes.length, 'recipe')} to your downloads.`
        : 'There are no recipes on this device to export.'
    );
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImportStatus(null);
      try {
        const result = await importRecipes(JSON.parse(await file.text()));
        setImportStatus({
          ok: result.added + result.replaced > 0,
          message: describeImport(result),
        });
      } catch {
        setImportStatus({
          ok: false,
          message: "That file couldn't be read as a Recipe Lab export.",
        });
      }
    };
    input.click();
  };

  const handleClear = async () => {
    await clearAllRecipes();
    setShowClearConfirm(false);
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Was a hand-rolled copy of TopBar's sticky header. */}
      <TopBar title="Settings" />

      <div className="p-4 space-y-8">
        {/* Account. The page never acknowledged who was signed in, which is odd
            for the screen people open looking for their account. Identity and
            sign-out live on the Profile page, so this links there rather than
            duplicating the anonymous-upgrade form and the sign-out confirm — two
            flows that would then need keeping in step. */}
        {isConfigured && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Account
            </h2>
            {user ? (
              <div className="space-y-2">
                <p className="text-sm text-text-primary">
                  Signed in as{' '}
                  <span className="font-medium">{user.displayName ?? 'Anonymous'}</span>
                </p>
                <p className="text-xs text-text-tertiary">
                  {user.isAnonymous
                    ? 'This account lives only in this browser. Add an email to keep your recipes.'
                    : user.email}
                </p>
                <Button variant="secondary" fullWidth onClick={() => navigate('/profile')}>
                  {user.isAnonymous ? 'Add an email, or sign out' : 'Manage account'}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">You're not signed in.</p>
                <Button variant="secondary" fullWidth onClick={() => navigate('/profile')}>
                  Sign in
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Appearance */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Appearance</h2>
          <SegmentedControl
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </section>

        {/* Units. Sits under Appearance because it is a display preference: it
            changes how recipes are rendered, never what is stored. */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Units</h2>
          <SegmentedControl
            label="Measurement units"
            value={unitSystem}
            onChange={setUnitSystem}
            options={[
              { value: 'original', label: 'As written' },
              { value: 'metric', label: 'Metric' },
              { value: 'imperial', label: 'Imperial' },
            ]}
          />
          <p className="text-xs text-text-tertiary">
            Converts ingredient amounts and oven temperatures as they're displayed. Anything
            that can't be converted exactly — a cup of flour into grams, "2 onions" — is left
            as written rather than guessed.
          </p>
        </section>

        {/* Data */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Data</h2>
          <div className="space-y-2">
            <Button variant="secondary" fullWidth onClick={handleExport}>
              Export All Recipes
            </Button>
            {exportStatus && (
              <p role="status" className="text-xs text-text-secondary">
                {exportStatus}
              </p>
            )}
            <Button variant="secondary" fullWidth onClick={handleImport}>
              Import Recipes
            </Button>
            {importStatus && (
              <p
                role="status"
                className={`text-xs ${
                  importStatus.ok
                    ? 'text-success-700 dark:text-success-400'
                    : 'text-danger-700 dark:text-danger-300'
                }`}
              >
                {importStatus.message}
              </p>
            )}
            {/* Named for what it actually does. "Clear All Data" implied it
                removed published recipes too, which it never did — they stay
                public under the user's name in the shared library. */}
            <Button variant="danger" fullWidth onClick={() => setShowClearConfirm(true)}>
              Delete Recipes on This Device
            </Button>
            <p className="text-xs text-text-tertiary">
              Recipes you've shared stay in the shared library. Delete those from each
              recipe's own page.
            </p>
          </div>
        </section>

        {/* Read from package.json via Vite `define`, so it cannot drift from
            reality the way the hardcoded "v1.0" had. */}
        <p className="text-xs text-text-tertiary text-center">
          {APP_NAME} v{__APP_VERSION__}
        </p>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Delete Recipes on This Device"
        message="This permanently deletes all recipes, variations and favourites stored on this device. Recipes you've already shared stay in the shared library. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
