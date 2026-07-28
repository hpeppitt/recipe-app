import { useState } from 'react';
import type { Instruction } from '../../types/recipe';

interface InstructionListProps {
  instructions: Instruction[];
  /** Cook-along mode: steps can be marked done. See IngredientList. */
  checkable?: boolean;
}

export function InstructionList({ instructions, checkable = false }: InstructionListProps) {
  const groups = groupInstructions(instructions);
  // Session-only, like the ingredient ticks: "done" means done in this cook.
  const [done, setDone] = useState<Set<number>>(new Set());

  const toggle = (step: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-text-primary">Instructions</h3>
      {groups.map(({ group, items }) => (
        <div key={group ?? '__default'}>
          {group && (
            <h4 className="text-sm font-medium text-text-secondary mb-2">{group}</h4>
          )}
          <ol className="space-y-3">
            {items.map((inst) => {
              const isDone = checkable && done.has(inst.step);
              // The step number doubles as the tick target: it is already a
              // circle in the right place, so cooking adds no new furniture.
              const marker = (
                <span
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isDone
                      ? 'bg-primary-600 text-white'
                      : 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
                  }`}
                >
                  {isDone ? '✓' : inst.step}
                </span>
              );
              const body = (
                <p
                  className={`text-text-primary leading-relaxed pt-1 ${
                    isDone ? 'line-through opacity-60' : ''
                  }`}
                >
                  {inst.text}
                </p>
              );

              if (!checkable) {
                return (
                  <li key={inst.step} className="flex gap-3 text-base">
                    {marker}
                    {body}
                  </li>
                );
              }

              return (
                <li key={inst.step} className="text-base">
                  <button
                    onClick={() => toggle(inst.step)}
                    aria-pressed={isDone}
                    className="w-full flex gap-3 text-left min-h-11 rounded-lg hover:bg-surface-secondary transition-colors"
                  >
                    {marker}
                    {body}
                  </button>
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
