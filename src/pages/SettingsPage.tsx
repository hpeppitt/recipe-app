import { useRef, useState, type ReactNode } from 'react';
import { exportAllRecipes, importRecipes, clearAllRecipes } from '../db/recipes';
import { exportAllFavorites } from '../db/favorites';
import { fetchCloudDataForExport } from '../services/firestore';
import { assembleDataExport, VERIFY_NOTE } from '../lib/dataExport';
import { describeImport } from '../lib/import';
import { pluralize } from '../lib/utils';
import { useUnitSystem } from '../hooks/useUnitSystem';
import { useConsent } from '../hooks/useConsent';
import { Avatar } from '../components/ui/Avatar';
import { IconButton } from '../components/ui/IconButton';
import { ChevronLeft, ChevronRight, Download } from '../components/ui/icons';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { APP_NAME } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { getPreviousUids } from '../services/storage';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const ROW =
  'flex w-full min-h-11 items-center justify-between gap-3 py-3.5 text-left text-[15px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50';
const CARD = 'rounded-[28px] bg-surface-secondary px-4 py-1';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 ml-1.5 text-xs font-semibold text-text-tertiary">{label}</h2>
      {children}
    </section>
  );
}

// Rules sit between rows only; a row's help and status text stay inside its wrapper.
function Row({ children }: { children: ReactNode }) {
  return <div className="border-b border-border last:border-b-0">{children}</div>;
}

function Help({ children }: { children: ReactNode }) {
  return <p className="pb-2 text-xs text-text-tertiary">{children}</p>;
}

export function SettingsPage() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // Export wrote a file and said nothing, so on a phone — where the download
  // lands out of sight — it was indistinguishable from a dead button.
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<{ busy?: boolean; failed?: boolean; message: string } | null>(null);
  const downloading = useRef(false);
  const { unitSystem, setUnitSystem } = useUnitSystem();
  const { configured: analyticsConfigured, granted: analyticsGranted, setConsent } = useConsent();
  const { user, isConfigured, signOut } = useAuth();
  // Same test as useOwnRecipesSync: for these users own recipes reload from the account.
  const accountReloads = isConfigured && !!user && !user.isAnonymous && user.emailVerified;
  const navigate = useNavigate();
  const accountName = user ? (user.displayName ?? 'Anonymous') : 'Sign in';
  const accountSub = !user ? 'Not signed in' : user.isAnonymous ? 'Guest · this device only' : user.email;
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  // 'default' is the first entry: nothing to go back to, so Back lands on the profile.
  const hasHistory = useLocation().key !== 'default';

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
      <header className="flex items-center gap-2 px-3 pt-3">
        <IconButton
          variant="flat"
          label="Back"
          icon={<ChevronLeft className="h-6 w-6" />}
          onClick={() => (hasHistory ? navigate(-1) : navigate('/profile'))}
        />
        <h1 className="font-heading text-[22px] text-text-primary">Settings</h1>
      </header>

      <div className="space-y-[18px] px-[18px] pb-[30px] pt-3">
        {isConfigured && (
          <Group label="Account">
            <div className={CARD}>
              <Row><button
                type="button"
                className={ROW}
                aria-label={`${accountName}, ${accountSub}`}
                onClick={() => navigate('/profile')}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex-shrink-0 [&>div]:h-10 [&>div]:w-10 [&>div]:text-sm">
                    <Avatar uid={user?.uid ?? 'local'} name={user?.displayName ?? null} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">
                      {accountName}
                    </span>
                    <span className="block truncate text-xs text-text-tertiary">
                      {accountSub}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
              </button></Row>
            </div>
            {user?.isAnonymous && (
              <p className="mt-2 ml-1.5 text-xs text-text-tertiary">
                Add an email to keep your recipes.
              </p>
            )}
          </Group>
        )}

        {/* A display preference: changes how recipes are rendered, never what is stored. */}
        <Group label="Appearance">
          <div className="rounded-[28px] bg-surface-secondary px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] text-text-primary">Units</span>
              <div className="w-full [&_button]:px-1.5 [&>div]:bg-surface">
              <SegmentedControl
                compact
                label="Measurement units"
                value={unitSystem}
                onChange={setUnitSystem}
                options={[
                  { value: 'original', label: 'As written' },
                  { value: 'metric', label: 'Metric' },
                  { value: 'imperial', label: 'Imperial' },
                ]}
              />
              </div>
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              Converts ingredient amounts and oven temperatures as they're displayed. Anything
              that can't be converted exactly — a cup of flour into grams, "2 onions" — is left
              as written rather than guessed.
            </p>
          </div>
        </Group>

        <Group label="Your data">
          <div className={CARD}>
            <Row>
              <button type="button" className={ROW} onClick={handleExport}>
                Export my recipes
                <Download className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
              </button>
              {exportStatus && (
                <p role="status" className="pb-2 text-xs text-text-tertiary">
                  {exportStatus}
                </p>
              )}
            </Row>
            <Row>
            <button type="button" className={ROW} disabled={dataStatus?.busy} onClick={handleDownloadData}>
              {dataStatus?.busy
                ? 'Preparing...'
                : user && !user.isAnonymous
                  ? 'Download my data'
                  : 'Download my data (this device only)'}
            </button>
            <Help>A full copy of your data for your records. To move recipes between devices, use Export my recipes.</Help>
            {dataStatus && (
              <p
                role={dataStatus.failed ? 'alert' : 'status'}
                className={`pb-2 text-xs ${dataStatus.failed ? 'text-danger-700' : 'text-text-tertiary'}`}
              >
                {dataStatus.message}
              </p>
            )}
            </Row>
            <Row>
              <button type="button" className={ROW} onClick={handleImport}>
                Import recipes
              </button>
              {importStatus && (
                <p
                  role="status"
                  className={`pb-2 text-xs ${importStatus.ok ? 'text-success-700' : 'text-danger-700'}`}
                >
                  {importStatus.message}
                </p>
              )}
            </Row>
            {/* Named for what it actually does. "Clear All Data" implied it
                removed published recipes too, which it never did — they stay
                public under the user's name in the shared library. */}
            <Row>
            <button
              type="button"
              className={`${ROW} font-semibold text-accent-700`}
              onClick={() => setShowClearConfirm(true)}
            >
              Delete recipes on this device
            </button>
            <Help>
              {accountReloads
                ? 'Recipes saved to your account stay there and load again the next time you open the app. To remove one for good, delete it from its own page.'
                : "Recipes you've shared stay in the shared library. Delete those from each recipe's own page."}
            </Help>
            </Row>
          </div>
        </Group>

        <Group label="Legal">
          <div className={CARD}>
            {[
              ['/terms', 'Terms of Service'],
              ['/privacy', 'Privacy Policy'],
              ['/cookies', 'Cookie Policy'],
            ].map(([to, label]) => (
              <Row key={to}>
                <Link to={to} className={ROW}>
                  {label}
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-text-tertiary" />
                </Link>
              </Row>
            ))}
            {/* Hidden until PostHog is configured: with no provider there is nothing to consent to. */}
            {analyticsConfigured && (
              <Row>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsGranted}
                  onClick={() => setConsent(!analyticsGranted)}
                  className={ROW}
                >
                  Privacy: allow analytics
                  <span
                    aria-hidden
                    className={`relative h-[26px] w-11 flex-shrink-0 rounded-full transition-colors ${analyticsGranted ? 'bg-accent-2-600' : 'bg-neutral-400'}`}
                  >
                    <span
                      className={`absolute top-[3px] h-5 w-5 rounded-full bg-surface transition-[left] ${analyticsGranted ? 'left-[21px]' : 'left-[3px]'}`}
                    />
                  </span>
                </button>
              </Row>
            )}
          </div>
        </Group>

        {user && (
          <div className={CARD}>
            <Row>
            {/* Anonymous accounts have no credential, so signing out is one-way: confirm first. */}
            <button
              type="button"
              className={`${ROW} font-semibold text-accent-700`}
              onClick={() => (user.isAnonymous ? setShowSignOutConfirm(true) : signOut())}
            >
              Sign out
            </button>
            </Row>
          </div>
        )}

        {/* Read from package.json via Vite `define`, so it cannot drift from
            reality the way the hardcoded "v1.0" had. */}
        <p className="text-xs text-text-tertiary text-center">
          {APP_NAME} v{__APP_VERSION__}
        </p>
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Sign out of this anonymous account?"
        message="There's no way to sign back in to an anonymous account. Recipes on this device stay here, but you won't be able to manage the copies you've already shared. Adding an email first keeps the account."
        confirmLabel="Sign Out"
        confirmVariant="danger"
        onConfirm={() => {
          setShowSignOutConfirm(false);
          signOut();
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />

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
