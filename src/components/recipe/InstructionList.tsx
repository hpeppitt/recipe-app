import { useState } from 'react';
import type { Instruction } from '../../types/recipe';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { convertTemperatures } from '../../lib/units';
import { Check } from '../ui/icons';

interface InstructionListProps {
  instructions: Instruction[];
  /** Cook-along mode: steps can be marked done. See IngredientList. */
  checkable?: boolean;
}

export function InstructionList({ instructions, checkable = false }: InstructionListProps) {
  const groups = groupInstructions(instructions);
  // Session-only, like the ingredient ticks: "done" means done in this cook.
  const [done, setDone] = useState<Set<number>>(new Set());
  const { unitSystem } = useUnitSystem();

  const toggle = (step: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });

  return (
    <div className="mt-[26px]">
      <h3 className="break-words font-heading text-[20px] leading-tight text-text-primary">Method</h3>
      {groups.map(({ group, items }) => (
        <div key={group ?? '__default'}>
          {group && (
            <h4 className="mt-3 break-words text-[14px] font-semibold text-text-secondary">{group}</h4>
          )}
          <ol className="mt-2">
            {items.map((inst) => {
              // Identity is the position in the list, not `inst.step`: the model can
              // restart numbering per group, and cloud data is not validated.
              const id = instructions.indexOf(inst);
              const isDone = checkable && done.has(id);
              // The disc doubles as the tick picture: it is already a circle in
              // the right place, so cooking adds no new furniture.
              const disc = (
                <span
                  aria-hidden="true"
                  className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full font-heading text-[14px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-700 ${
                    isDone ? 'bg-accent-2-600 text-surface' : 'bg-surface-secondary text-text-primary'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : inst.step}
                </span>
              );
              // Oven temperatures live in prose, so converting ingredients
              // while leaving "Bake at 180°C" alone would be a half-done
              // toggle. Rewritten for display only.
              const body = (
                <span
                  className={`min-w-0 flex-1 break-words text-text-primary ${
                    isDone ? 'line-through opacity-60' : ''
                  }`}
                >
                  {convertTemperatures(inst.text ?? '', unitSystem)}
                </span>
              );
              const row = 'flex min-h-11 items-start gap-3 py-2 text-[15px] leading-normal';

              if (!checkable) {
                return (
                  <li key={id} className={row}>
                    {disc}
                    {body}
                  </li>
                );
              }

              return (
                <li key={id}>
                  {/* Native checkbox, visually hidden, named by the step text (or its number if blank). */}
                  <label className={`${row} cursor-pointer`}>
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggle(id)}
                      aria-label={inst.text?.trim() ? undefined : `Step ${inst.step}`}
                      className="peer sr-only"
                    />
                    {disc}
                    {body}
                  </label>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function groupInstructions(instructions: Instruction[]) {
  const groups: { group: string | null; items: Instruction[] }[] = [];
  let currentGroup: string | null = null;
  let currentItems: Instruction[] = [];

  for (const inst of instructions) {
    if (inst.group !== currentGroup) {
      if (currentItems.length > 0) {
        groups.push({ group: currentGroup, items: currentItems });
      }
      currentGroup = inst.group;
      currentItems = [inst];
    } else {
      currentItems.push(inst);
    }
  }
  if (currentItems.length > 0) {
    groups.push({ group: currentGroup, items: currentItems });
  }
  return groups;
}
