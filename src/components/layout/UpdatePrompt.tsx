import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from '../ui/Button';

// One registration for the whole app, even if the effect runs twice (StrictMode).
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

/**
 * Mounted once in App.tsx outside the route tree, so it covers deep links too. Registers the service worker and offers a reload when a new build is waiting.
 * registerType is 'prompt', so nothing reloads until the user taps Reload.
 * In dev the plugin's register is a no-op unless devOptions is enabled.
 */
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    updateSW ??= registerSW({ onNeedRefresh: () => setNeedRefresh(true) });
  }, []);

  // The status wrapper is always mounted so screen readers announce the content added later.
  return (
    <div
      role="status"
      // Sits on top of the 78px bottom nav (RL-097); elsewhere it floats the same height above sticky footers.
      className="fixed bottom-[calc(70px_+_max(8px,env(safe-area-inset-bottom)))] left-0 right-0 z-40 px-3 pb-2 max-w-lg mx-auto"
    >
      {needRefresh && <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary shadow-md">
        <span className="flex-1">Update available</span>
        <Button size="sm" onClick={() => void updateSW?.(true)}>
          Reload
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Dismiss
        </Button>
      </div>}
    </div>
  );
}
