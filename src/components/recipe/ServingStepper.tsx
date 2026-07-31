import { pluralize } from '../../lib/utils';

interface ServingStepperProps {
  servings: number;
  original: number;
  onChange: (servings: number) => void;
}

/** Nobody is cooking for 0, and past this the arithmetic stops being useful. */
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

/**
 * Adjusts the serving count a recipe is displayed at.
 *
 * Display only — nothing is written. The Reset affordance appears once the count
 * differs from the stored one, because a scaled view that looks permanent is the
 * failure mode here: someone should always be able to see, and get back to, what
 * the recipe actually says.
 */
export function ServingStepper({ servings, original, onChange }: ServingStepperProps) {
  const step = (delta: number) =>
    onChange(Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, servings + delta)));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-text-secondary">Scale to</span>
      <div className="flex items-center rounded-xl border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={servings <= MIN_SERVINGS}
          aria-label="One fewer serving"
          className="w-11 h-11 flex items-center justify-center text-text-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>
        {/* aria-live so a screen reader hears the new count, which is the only
            thing that changed on the page from its point of view. */}
        <span
          aria-live="polite"
          className="min-w-[5.5rem] text-center text-sm font-medium text-text-primary tabular-nums px-1"
        >
          {servings} {pluralize(servings, 'serving')}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={servings >= MAX_SERVINGS}
          aria-label="One more serving"
          className="w-11 h-11 flex items-center justify-center text-text-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {servings !== original && (
        <button
          type="button"
          onClick={() => onChange(original)}
          className="min-h-11 px-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Reset to {original}
        </button>
      )}
    </div>
  );
}
