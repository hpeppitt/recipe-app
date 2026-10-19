interface TypingIndicatorProps {
  /** What is actually happening. Defaults to generation, the longer wait. */
  label?: string;
}

// Decorative: the page's single live region announces the same label, so this
// is hidden from assistive tech rather than announced twice.
export function TypingIndicator({ label = 'Generating recipe...' }: TypingIndicatorProps) {
  return (
    <div aria-hidden="true" className="flex min-w-0 items-center gap-2 px-1 py-2">
      <div className="flex gap-1">
        <span className="size-2 rounded-full bg-accent-400 motion-safe:animate-bounce [animation-delay:0ms]" />
        <span className="size-2 rounded-full bg-accent-300 motion-safe:animate-bounce [animation-delay:150ms]" />
        <span className="size-2 rounded-full bg-accent-200 motion-safe:animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="min-w-0 break-words text-[13px] text-text-tertiary">{label}</span>
    </div>
  );
}
