import { pluralize } from '../../lib/utils';
import { scaleNote } from '../../lib/scale';
import { Minus, Plus, Scale } from '../ui/icons';

interface ServingStepperProps {
  servings: number;
  onChange: (servings: number) => void;
}

/** Nobody is cooking for 0, and past this the arithmetic stops being useful. */
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

// 34px visible, 44px target: the pseudo-element extends the hit area without clipping (no overflow here).
const STEP_BUTTON =
  'relative flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-surface text-text-primary before:absolute before:-inset-[5px] before:content-[""] disabled:pointer-events-none disabled:opacity-40';

/**
 * Adjusts the serving count a recipe is displayed at. Display only, nothing is written.
 * The Scaled strip (below) is what lets someone see, and get back to, what the recipe says.
 */
export function ServingStepper({ servings, onChange }: ServingStepperProps) {
  const step = (delta: number) =>
    onChange(Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, servings + delta)));

  return (
    <div className="flex flex-shrink-0 items-center gap-1 rounded-full bg-surface-secondary p-[3px]">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={servings <= MIN_SERVINGS}
        aria-label="One fewer serving"
        className={STEP_BUTTON}
      >
        <Minus className="h-4 w-4" />
      </button>
      {/* aria-live so a screen reader hears the new count. */}
      <span aria-live="polite" className="min-w-16 text-center text-[13px] font-semibold tabular-nums text-text-primary">
        {servings} {pluralize(servings, 'serving')}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={servings >= MAX_SERVINGS}
        aria-label="One more serving"
        className={STEP_BUTTON}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Shown only while the count differs from the stored one; Reset restores it. */
export function ScaledStrip({ servings, original, onReset }: { servings: number; original: number; onReset: () => void }) {
  const note = scaleNote(servings, original);
  if (!note) return null;
  return (
    <div className="mt-2.5 flex items-center gap-2.5 rounded-[18px] bg-accent-100 px-3.5 py-2.5 text-[13px] text-accent-900">
      <Scale className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 flex-1 break-words">{note}</span>
      <button
        type="button"
        onClick={onReset}
        className="relative flex-shrink-0 leading-5 underline before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
      >
        Reset
      </button>
    </div>
  );
}
