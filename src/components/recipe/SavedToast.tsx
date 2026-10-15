/**
 * The save confirmation on the recipe page. Saving used to be silent: the page
 * simply changed. Worse, a failed cloud publish was console-only, so the user
 * believed a local-only recipe was shared. Reuses the Share toast treatment.
 *
 * `note` replaces the default local-only explanation when the publish was
 * refused for a known reason, such as the daily publish limit (RL-049).
 */
export function SavedToast({ outcome, note }: { outcome: 'cloud' | 'local'; note?: string | null }) {
  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg"
    >
      <p className="text-sm font-medium text-text-primary">
        {outcome === 'cloud' ? 'Recipe saved' : 'Saved on this device'}
      </p>
      {outcome === 'local' && (
        <p className="mt-0.5 text-xs text-text-secondary">
          {note ??
            "It couldn't be shared to the library just now, so others can't see it yet. Sharing this recipe will retry."}
        </p>
      )}
    </div>
  );
}
