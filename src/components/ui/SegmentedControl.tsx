import { cn } from '../../lib/utils';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Compact segments for use inside a panel rather than as a page-level control.
   * The two existing copies differed only in this padding, which is why they had
   * drifted apart in the first place.
   */
  compact?: boolean;
  /** Names the group for assistive tech, since the buttons alone imply no relationship. */
  label: string;
}

/**
 * One segmented control, replacing two hand-rolled copies with different metrics
 * (Settings' theme picker at px-4 py-2 text-sm, AvatarEditor's tabs at px-3 py-2
 * text-xs). Uses `radiogroup` so the options are announced as a single choice
 * rather than three unrelated buttons.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  label,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-xl border border-border overflow-hidden"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              // 44px floor on both variants. `compact` shrinks the type and
              // horizontal padding, not the target — the first version of this
              // component reproduced the 40px/32px heights it was meant to fix.
              'flex-1 font-medium transition-colors min-h-11',
              compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm',
              selected
                ? 'bg-primary-600 text-white'
                : 'bg-surface text-text-secondary hover:bg-surface-tertiary'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
