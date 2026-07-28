import type { Nutrition } from '../../types/recipe';

interface NutritionPanelProps {
  nutrition: Nutrition | null | undefined;
  servings: number;
}

/**
 * Per-serving macro estimates.
 *
 * Renders nothing when there is no data, which is the case for every recipe
 * generated before the field existed. Showing zeros instead would state that the
 * dish has no calories rather than that we don't know.
 *
 * The "Estimated" label is not decoration. These numbers come from the model's
 * general knowledge of ingredients, not a food database, so they are
 * approximations — and nutrition data that looks authoritative while being
 * approximate is the failure mode worth guarding against.
 */
export function NutritionPanel({ nutrition, servings }: NutritionPanelProps) {
  if (!nutrition) return null;

  const items = [
    { label: 'kcal', value: Math.round(nutrition.calories) },
    { label: 'protein', value: `${Math.round(nutrition.protein)}g` },
    { label: 'carbs', value: `${Math.round(nutrition.carbs)}g` },
    { label: 'fat', value: `${Math.round(nutrition.fat)}g` },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-text-primary">Nutrition</h3>
        <span className="text-xs text-text-tertiary">
          estimated, per serving{servings > 0 ? ` (of ${servings})` : ''}
        </span>
      </div>
      <div className="flex border border-border rounded-2xl overflow-hidden divide-x divide-border">
        {items.map((item) => (
          <div key={item.label} className="flex-1 text-center py-2">
            <p className="text-base font-semibold text-text-primary">{item.value}</p>
            <p className="text-xs text-text-tertiary">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
