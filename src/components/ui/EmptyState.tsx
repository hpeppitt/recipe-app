import type { ReactNode } from 'react';
import { EmojiBlob } from './EmojiBlob';

interface EmptyStateProps {
  /** An emoji string, or an icon component (rendered at 36px in the tone's ink colour). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** `error` swaps the sage circle and blob for terracotta ones (Organic 19a). */
  tone?: 'empty' | 'error';
  /**
   * Sized to sit inside a section rather than fill a page. Without this the
   * full-page treatment (bottom-aligned, 84px blob) dwarfs the list it belongs
   * to, which is why these spots had grown their own bare-paragraph styles.
   */
  compact?: boolean;
  /**
   * The way out of this empty state.
   *
   * A `ReactNode` rather than a label/onClick pair so callers keep control of the
   * variant, and so a state with no sensible next step can simply omit it.
   */
  action?: ReactNode;
}

export function EmptyState({
  icon = '📖',
  title,
  description,
  tone = 'empty',
  compact = false,
  action,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-6 px-4">
        <span className="text-3xl mb-2">{icon}</span>
        {/* A section-level empty state sits under an existing heading, so h2 would
            misreport the outline. Only the full-page variant is a real heading. */}
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        {description && <p className="text-sm text-text-secondary max-w-xs mt-1">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    );
  }

  const error = tone === 'error';
  return (
    <div className="relative flex min-h-[70dvh] flex-col items-start justify-end gap-2.5 overflow-hidden px-6 pb-7 text-left">
      <div
        aria-hidden="true"
        className={`absolute size-60 rounded-full -top-[60px] ${
          error ? '-left-[70px] bg-accent-200' : '-right-[70px] bg-accent-2-200'
        }`}
      />
      <EmojiBlob size={84} tint={error ? 'bg-accent-300' : 'bg-accent-2-300'} className="relative">
        <span className={`flex size-9 items-center justify-center ${error ? 'text-accent-900' : 'text-accent-2-900'}`}>
          {typeof icon === 'string' ? <span className="text-4xl leading-none">{icon}</span> : <span className="size-9 [&>svg]:size-full">{icon}</span>}
        </span>
      </EmojiBlob>
      <h2 className="relative font-heading text-[26px] leading-[1.1] text-text-primary">{title}</h2>
      {description && <p className="relative text-sm text-text-secondary max-w-xs">{description}</p>}
      {action && <div className="relative mt-1.5 self-start">{action}</div>}
    </div>
  );
}
