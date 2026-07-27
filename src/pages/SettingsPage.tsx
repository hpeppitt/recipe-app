import { useState } from 'react';
import { exportAllRecipes, importRecipes, clearAllRecipes } from '../db/recipes';
import { describeImport } from '../lib/import';
import { useTheme } from '../hooks/useTheme';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { APP_NAME } from '../lib/constants';

export function SettingsPage() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const { theme, setTheme } = useTheme();

  const handleExport = async () => {
    const recipes = await exportAllRecipes();
    const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe-lab-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-4">
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <div className="p-4 space-y-8">
        {/* Theme */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Theme</h2>
          <div className="flex rounded-xl border border-border overflow-hidden">
            {(['system', 'light', 'dark'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  theme === option
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {/* Data */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Data</h2>
          <div className="space-y-2">
            <Button variant="secondary" fullWidth onClick={handleExport}>
              Export All Recipes
            </Button>
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
            <Button variant="danger" fullWidth onClick={() => setShowClearConfirm(true)}>
              Clear All Data
            </Button>
          </div>
        </section>

        <p className="text-xs text-text-tertiary text-center">{APP_NAME} v1.0</p>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear All Data"
        message="This will permanently delete all recipes and variations. This cannot be undone."
        confirmLabel="Clear All"
        confirmVariant="danger"
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
