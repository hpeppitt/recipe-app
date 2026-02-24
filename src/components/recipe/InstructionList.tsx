import type { Instruction } from '../../types/recipe';

interface InstructionListProps {
  instructions: Instruction[];
}

export function InstructionList({ instructions }: InstructionListProps) {
  const groups = groupInstructions(instructions);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-text-primary">Instructions</h3>
      {groups.map(({ group, items }) => (
        <div key={group ?? '__default'}>
          {group && (
            <h4 className="text-sm font-medium text-text-secondary mb-2">{group}</h4>
          )}
          <ol className="space-y-3">
            {items.map((inst) => (
              <li key={inst.step} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                  {inst.step}
                </span>
                <p className="text-text-primary leading-relaxed pt-0.5">{inst.text}</p>
              </li>
            ))}
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
