import { useRef, useState } from 'react';
import { exportAllRecipes, importRecipes, clearAllRecipes } from '../db/recipes';
import { exportAllFavorites } from '../db/favorites';
import { fetchCloudDataForExport } from '../services/firestore';
import { assembleDataExport, VERIFY_NOTE } from '../lib/dataExport';
import { describeImport } from '../lib/import';
import { pluralize } from '../lib/utils';
import { useTheme } from '../hooks/useTheme';
import { useUnitSystem } from '../hooks/useUnitSystem';
import { useConsent } from '../hooks/useConsent';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { APP_NAME } from '../lib/constants';
import { TopBar } from '../components/layout/TopBar';
import { useAuth } from '../contexts/AuthContext';
import { getPreviousUids } from '../services/storage';
import { Link, useNavigate } from 'react-router-dom';

export function SettingsPage() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // Export wrote a file and said nothing, so on a phone — where the download
  // lands out of sight — it was indistinguishable from a dead button.
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<{ busy?: boolean; failed?: boolean; message: string } | null>(null);
  const downloading = useRef(false);
  const { theme, setTheme } = useTheme();
  const { unitSystem, setUnitSystem } = useUnitSystem();
  const { configured: analyticsConfigured, granted: analyticsGranted, setConsent } = useConsent();
  const { user, isConfigured } = useAuth();
  // Same test as useOwnRecipesSync: for these users own recipes reload from the account.
  const accountReloads = isConfigured && !!user && !user.isAnonymous && user.emailVerified;
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

  // Anonymous and signed-out users have no readable cloud data (rules), so they get this device only.
  const handleDownloadData = async () => {
    // A ref, not the busy state: two taps in one frame both see the old state.
    if (downloading.current) return;
    downloading.current = true;
    setDataStatus({ busy: true, message: 'Preparing...' });
    try {
      // Let "Preparing..." paint before the synchronous work below.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const cloud = user && !user.isAnonymous;
      const [recipes, bookmarks, cloudInput] = await Promise.all([
        exportAllRecipes(),
        exportAllFavorites(),
        cloud ? fetchCloudDataForExport(user.uid, user.emailVerified) : undefined,
      ]);
      const out = assembleDataExport({
        uid: user?.uid ?? 'local',
        exportedAt: new Date().toISOString(),
        local: { recipes, bookmarks },
        cloud: cloudInput,
      });
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recipe-lab-data-${out.exportedAt.split('T')[0]}.json`;
      a.click();
      // Not at once: some browsers start the download after click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const everyCloudReadFailed = !!cloudInput && Object.values(cloudInput).every((sec) => 'error' in sec);
      if (everyCloudReadFailed) {
        setDataStatus({
          failed: true,
          message: out.errors.some((e) => e.message === VERIFY_NOTE)
            ? `Your online data could not be loaded, so the file only contains what is on this device. ${VERIFY_NOTE}, or try again later.`
            : 'Your online data could not be loaded, so the file only contains what is on this device. Try again later.',
        });
      } else if (out.errors.length > 0) {
        const parts = [...new Set(out.errors.map((e) => e.section))].join(', ');
        const verify = out.errors.some((e) => e.message === VERIFY_NOTE);
        const other = out.errors.some((e) => e.message !== VERIFY_NOTE);
        setDataStatus({
          message: `Your data was downloaded, but some of your online data (${parts}) could not be included.${verify ? ` ${VERIFY_NOTE}.` : ''}${other ? ' Try again later for the rest.' : ''}`,
        });
      } else {
        setDataStatus({ message: 'Your data was downloaded.' });
      }
    } catch {
      setDataStatus({ failed: true, message: "Couldn't prepare your data. Please try again." });
    } finally {
      downloading.current = false;
    }
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
        const result = await importRecipes(JSON.parse(await file.text()), {
          uid: user?.uid,
          previousUids: getPreviousUids(),
        });
        setImportStatus({
          ok: result.added + result.replaced + result.alreadyInAccount > 0,
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
            <Button variant="secondary" fullWidth disabled={dataStatus?.busy} onClick={handleDownloadData}>
              {dataStatus?.busy
                ? 'Preparing...'
                : user && !user.isAnonymous
                  ? 'Download my data'
                  : 'Download my data (this device only)'}
            </Button>
            <p className="text-xs text-text-tertiary">
              A full copy of your data for your records. To move recipes between devices, use Export All Recipes.
            </p>
            {dataStatus && (
              <p
                role={dataStatus.failed ? 'alert' : 'status'}
                className={`text-xs ${dataStatus.failed ? 'text-danger-700 dark:text-danger-300' : 'text-text-secondary'}`}
              >
                {dataStatus.message}
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
              {accountReloads
                ? 'Recipes saved to your account stay there and load again the next time you open the app. To remove one for good, delete it from its own page.'
                : "Recipes you've shared stay in the shared library. Delete those from each recipe's own page."}
            </p>
          </div>
        </section>

        {/* Legal */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Legal</h2>
          <ul className="space-y-2">
            {[
              ['/terms', 'Terms of Service'],
              ['/privacy', 'Privacy Policy'],
              ['/cookies', 'Cookie Policy'],
            ].map(([to, label]) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex items-center min-h-11 px-4 rounded-xl border border-border bg-surface-secondary text-sm text-text-primary hover:bg-surface-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Hidden until PostHog is configured: with no provider there is nothing to consent to. */}
          {analyticsConfigured && (
            <label className="flex items-center justify-between gap-3 min-h-11 px-4 rounded-xl border border-border bg-surface-secondary text-sm text-text-primary">
              Privacy: allow analytics
              <input
                type="checkbox"
                checked={analyticsGranted}
                onChange={(e) => setConsent(e.target.checked)}
                className="h-5 w-5 accent-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              />
            </label>
          )}
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
        message={
          accountReloads
            ? 'This deletes all recipes, variations and favourites stored on this device. Recipes saved to your account stay there and load again the next time you open the app.'
            : "This permanently deletes all recipes, variations and favourites stored on this device. Recipes you've already shared stay in the shared library. This cannot be undone."
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
