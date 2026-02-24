import type { Ingredient } from '../../types/recipe';

interface IngredientListProps {
  ingredients: Ingredient[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  const groups = groupIngredients(ingredients);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-text-primary">Ingredients</h3>
      {groups.map(({ group, items }) => (
        <div key={group ?? '__default'}>
          {group && (
            <h4 className="text-sm font-medium text-text-secondary mb-2">{group}</h4>
          )}
          <ul className="space-y-1.5">
            {items.map((ing, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-primary-500 mt-0.5">•</span>
                <span>
                  {ing.amount != null && (
                    <span className="font-medium">{formatAmount(ing.amount)}</span>
                  )}{' '}
                  {ing.unit && <span>{ing.unit}</span>}{' '}
                  <span className="text-text-primary">{ing.name}</span>
                  {ing.notes && (
                    <span className="text-text-tertiary">, {ing.notes}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function groupIngredients(ingredients: Ingredient[]) {
  const groups: { group: string | null; items: Ingredient[] }[] = [];
  let currentGroup: string | null = null;
  let currentItems: Ingredient[] = [];

  for (const ing of ingredients) {
    if (ing.group !== currentGroup) {
      if (currentItems.length > 0) {
        groups.push({ group: currentGroup, items: currentItems });
      }
      currentGroup = ing.group;
      currentItems = [ing];
    } else {
      currentItems.push(ing);
    }
  }
  if (currentItems.length > 0) {
    groups.push({ group: currentGroup, items: currentItems });
  }
  return groups;
}

function formatAmount(amount: number): string {
  const fractions: Record<number, string> = {
    0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾',
  };
  const whole = Math.floor(amount);
  const frac = Math.round((amount - whole) * 100) / 100;
  const fracStr = fractions[frac] ?? (frac > 0 ? frac.toString().slice(1) : '');
  if (whole === 0 && fracStr) return fracStr;
  if (fracStr) return `${whole}${fracStr}`;
  return amount.toString();
}
