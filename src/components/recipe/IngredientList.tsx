import { useState, type ReactNode } from 'react';
import type { Ingredient } from '../../types/recipe';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { convertAmount, formatUnit } from '../../lib/units';
import { formatAmount } from '../../lib/amount';
import { Check } from '../ui/icons';

interface IngredientListProps {
  ingredients: Ingredient[];
  /**
   * Cook-along mode: each row becomes a tick-off target. Off in the chat preview
   * card, where the recipe is a proposal rather than something being cooked.
   */
  checkable?: boolean;
  /** The servings stepper, at the right of the heading. */
  headingAside?: ReactNode;
  /** The Scaled strip, between the heading and the rows. */
  belowHeading?: ReactNode;
  /** Amounts are shown at a count other than the stored one: they turn terracotta. */
  scaled?: boolean;
}

export function IngredientList({ ingredients, checkable = false, headingAside, belowHeading, scaled = false }: IngredientListProps) {
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
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <h3 className="min-w-0 flex-1 break-words font-heading text-[20px] leading-tight text-text-primary">Ingredients</h3>
        {headingAside}
      </div>
      {belowHeading}
      {groups.map(({ group, items }) => (
        <div key={group ?? '__default'} className="mt-3">
          {group && (
            <h4 className="mb-1 break-words text-[14px] font-semibold text-text-secondary">{group}</h4>
          )}
          <ul>
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
              // Pluralised against the amount actually shown, not the stored one,
              // so a converted value gets the agreement its own number implies.
              const shownUnit = formatUnit(converted ? converted.unit : ing.unit, shownAmount);

              // Amount and unit in one column so the names line up; bold, terracotta when scaled.
              const amount = (
                <span className={`min-w-[62px] flex-shrink-0 font-bold ${scaled ? 'text-accent-700' : ''}`}>
                  {shownAmount != null && formatAmount(shownAmount)}
                  {shownAmount != null && shownUnit ? ' ' : ''}
                  {shownUnit}
                </span>
              );
              const name = (
                <span className={`min-w-0 flex-1 break-words text-text-primary ${isChecked ? 'line-through opacity-60' : ''}`}>
                  {ing.name}
                  {ing.notes && <span className="text-text-tertiary">, {ing.notes}</span>}
                </span>
              );
              const row = 'flex min-h-11 items-center gap-3 border-b border-text-primary/8 py-[9px] text-[15px]';

              if (!checkable) {
                return (
                  <li key={i} className={row}>
                    {amount}
                    {name}
                  </li>
                );
              }

              return (
                <li key={i}>
                  {/* Native checkbox, visually hidden, named by the row text; the circle is its picture. */}
                  <label className={`${row} cursor-pointer`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(key)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-700 ${
                        isChecked ? 'border-accent-2-600 bg-accent-2-600 text-surface' : 'border-neutral-400'
                      }`}
                    >
                      {isChecked && <Check className="h-3 w-3" />}
                    </span>
                    {amount}
                    {name}
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
