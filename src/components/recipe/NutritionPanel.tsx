import { useId, useState } from 'react';
import type { Nutrition } from '../../types/recipe';
import { ChevronDown, ChevronUp } from '../ui/icons';

interface NutritionPanelProps {
  nutrition: Nutrition | null | undefined;
}

// Cloud documents are not validated on read, so a macro can be missing: show a dash, not NaN.
const figure = (n: unknown, unit = '') =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}${unit}` : '-';

/**
 * Per-serving macro estimates, in a card that is collapsed on load.
 *
 * Renders nothing when there is no data, which is the case for every recipe
 * generated before the field existed. Showing zeros instead would state that the
 * dish has no calories rather than that we don't know.
 *
 * The "Estimated" note is not decoration. These numbers come from the model's
 * general knowledge of ingredients, not a food database, so they are
 * approximations. The open state is not remembered; callers key the recipe so
 * it also resets when the recipe changes.
 */
export function NutritionPanel({ nutrition }: NutritionPanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!nutrition) return null;

  const items = [
    { label: 'Calories', value: figure(nutrition.calories) },
    { label: 'Carbs', value: figure(nutrition.carbs, ' g') },
    { label: 'Fat', value: figure(nutrition.fat, ' g') },
    { label: 'Protein', value: figure(nutrition.protein, ' g') },
  ];
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <div className="mt-[18px] flex flex-col gap-3 rounded-[28px] bg-surface-secondary px-4 py-[14px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1 break-words font-heading text-[17px] text-text-primary">
          Nutrition per serving
        </span>
        <Chevron className="h-5 w-5 flex-shrink-0 text-text-primary" />
      </button>
      <div id={panelId} hidden={!open}>
        {open && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {items.map((item) => (
                <div key={item.label} className="min-w-0 rounded-[18px] bg-surface px-1.5 py-2.5 text-center">
                  <p className="break-words font-heading text-[18px] text-text-primary">{item.value}</p>
                  <p className="break-words text-[11px] text-text-tertiary">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              Estimated from ingredients. Changes with each branch.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
