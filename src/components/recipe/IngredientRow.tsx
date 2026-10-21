import type { ReactNode } from 'react';

/**
 * Pill field styling. Width is deliberately absent: it is set per field, because
 * Tailwind resolves by stylesheet order, so a baked-in `w-full` once defeated the
 * narrow widths on the ingredient row and pushed the name field out of view.
 */
export const pill =
  'h-11 rounded-full border border-neutral-400 bg-neutral-100 px-3 text-text-primary ' +
  'placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 ' +
  'focus:border-transparent transition-shadow';

/** Keeps a focused or scrolled-to field clear of the header and the sticky footer. */
export const FOCUS_SCROLL = 'scroll-mt-20 scroll-mb-44';

type Field = 'amount' | 'unit' | 'name';
type Invalid = { 'aria-invalid'?: true; 'aria-describedby'?: string };

/**
 * The 8a ingredient row (RL-110): amount, unit and name pills, shared by the recipe editor and
 * the import review (RL-252). `leading` and `trailing` hold the editor's grip and remove button.
 * A `flagged` row (an amount the import could not read) is tinted with a Check label.
 */
export function IngredientRow({
  index,
  row,
  onField,
  amountProps,
  nameProps,
  leading,
  trailing,
  flagged,
}: {
  index: number;
  row: { amount: string; unit: string; name: string };
  onField: (field: Field, value: string) => void;
  amountProps?: Invalid;
  nameProps?: Invalid;
  leading?: ReactNode;
  trailing?: ReactNode;
  flagged?: boolean;
}) {
  return (
    // Wraps instead of squeezing: at 320px the name and remove button
    // drop to a second line rather than leaving a 68px name field.
    <div className={`flex flex-wrap items-center gap-2 ${flagged ? 'rounded-3xl bg-accent-100 p-1' : ''}`}>
      {leading}
      <input
        id={`ingredient-${index}-amount`}
        aria-label={`Ingredient ${index + 1} amount`}
        inputMode="decimal"
        placeholder={flagged ? '?' : 'Amount'}
        value={row.amount}
        onChange={(e) => onField('amount', e.target.value)}
        {...amountProps}
        aria-describedby={[flagged && `ingredient-${index}-flag`, amountProps?.['aria-describedby']].filter(Boolean).join(' ') || undefined}
        className={`${pill} ${FOCUS_SCROLL} w-[76px] shrink-0 text-sm font-bold ${flagged ? 'placeholder:font-bold placeholder:text-accent-700' : ''}`}
      />
      <input
        aria-label={`Ingredient ${index + 1} unit`}
        placeholder="Unit"
        value={row.unit}
        onChange={(e) => onField('unit', e.target.value)}
        className={`${pill} w-16 shrink-0 text-sm`}
      />
      <div className="flex min-w-40 flex-1 items-center gap-2">
        <input
          id={`ingredient-${index}-name`}
          aria-label={`Ingredient ${index + 1} name`}
          placeholder="Name"
          value={row.name}
          onChange={(e) => onField('name', e.target.value)}
          {...nameProps}
          className={`${pill} ${FOCUS_SCROLL} min-w-0 flex-1 text-sm`}
        />
        {flagged && (
          <span id={`ingredient-${index}-flag`} className="shrink-0 pr-2 text-xs font-semibold text-accent-700">
            Check<span className="sr-only"> Amount unclear</span>
          </span>
        )}
        {trailing}
      </div>
    </div>
  );
}
