import { useState } from 'react';
import type { Ingredient } from '../../types/recipe';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { convertAmount } from '../../lib/units';

interface IngredientListProps {
  ingredients: Ingredient[];
  /**
   * Cook-along mode: each row becomes a tick-off target. Off in the chat preview
   * card, where the recipe is a proposal rather than something being cooked.
   */
  checkable?: boolean;
}

export function IngredientList({ ingredients, checkable = false }: IngredientListProps) {
  const groups = groupIngredients(ingredients);
  // Deliberately not persisted. A tick means "I have this out on the counter
  // right now"; restoring yesterday's ticks would be actively misleading.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { unitSystem } = useUnitSystem();

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-text-primary">Ingredients</h3>
      {groups.map(({ group, items }) => (
        <div key={group ?? '__default'}>
          {group && (
            <h4 className="text-sm font-medium text-text-secondary mb-2">{group}</h4>
          )}
          <ul className={checkable ? 'space-y-0.5' : 'space-y-1.5'}>
            {items.map((ing, i) => {
              const key = `${group ?? ''}-${i}`;
              const isChecked = checked.has(key);
              // text-base, not text-sm: this is read at arm's length on a
              // counter, which is the one place 14px is least defensible.
              // Converted at display time only; the stored recipe is untouched so a
              // shared link means the same thing to everyone. `null` means the
              // conversion was not reliable (unknown unit, or a count), in which
              // case the original is shown.
              // The name is passed so a cup of a known dry ingredient can become
              // grams rather than millilitres; an unrecognised name simply keeps
              // the volume-to-volume answer.
              const converted = convertAmount(ing.amount, ing.unit, unitSystem, ing.name);
              const shownAmount = converted ? converted.amount : ing.amount;
              const shownUnit = converted ? converted.unit : ing.unit;

              const body = (
                <span className={isChecked ? 'line-through opacity-60' : undefined}>
                  {shownAmount != null && (
                    <span className="font-medium">{formatAmount(shownAmount)}</span>
                  )}{' '}
                  {shownUnit && <span>{shownUnit}</span>}{' '}
                  <span className="text-text-primary">{ing.name}</span>
                  {ing.notes && <span className="text-text-tertiary">, {ing.notes}</span>}
                </span>
              );

              if (!checkable) {
                return (
                  <li key={i} className="flex gap-2 text-base">
                    <span className="text-primary-500 mt-0.5">•</span>
                    {body}
                  </li>
                );
              }

              return (
                <li key={i} className="text-base">
                  <label className="flex gap-3 items-start min-h-11 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(key)}
                      className="mt-1 w-5 h-5 flex-shrink-0 accent-primary-600"
                    />
                    {body}
                  </label>
                </li>
              );
            })}
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
