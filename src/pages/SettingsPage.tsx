import { useState } from 'react';
import { getApiKey, setApiKey } from '../services/storage';
import { testConnection } from '../services/gemini';
import { exportAllRecipes, importRecipes, clearAllRecipes } from '../db/recipes';
import { useTheme } from '../hooks/useTheme';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Spinner } from '../components/ui/Spinner';
import { APP_NAME } from '../lib/constants';

export function SettingsPage() {
  const [apiKey, setApiKeyState] = useState(getApiKey);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleSaveKey = () => {
    setApiKey(apiKey);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testConnection(apiKey);
    setTestResult(result);
    setTesting(false);
  };

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
      try {
        const text = await file.text();
        const recipes = JSON.parse(text);
        await importRecipes(recipes);
        alert('Recipes imported successfully!');
      } catch {
        alert('Failed to import recipes. Please check the file format.');
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
        {/* API Key */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Gemini API Key</h2>
          <div className="space-y-2">
            <div className="relative">
              <Input
                value={apiKey}
                onChange={(e) => {
                  setApiKeyState(e.target.value);
                  setTestResult(null);
                }}
                type={showKey ? 'text' : 'password'}
                placeholder="Enter your Gemini API key"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary hover:text-text-secondary"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleSaveKey}>
                Save Key
              </Button>
              <Button size="sm" variant="secondary" onClick={handleTest} disabled={!apiKey || testing}>
                {testing ? <Spinner size="sm" /> : 'Test Connection'}
              </Button>
            </div>
            {testResult !== null && (
              <p className={`text-sm ${testResult ? 'text-success-600' : 'text-danger-600'}`}>
                {testResult ? 'Connection successful!' : 'Connection failed. Check your API key.'}
              </p>
            )}
          </div>
        </section>

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
