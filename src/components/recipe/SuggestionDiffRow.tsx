import type { SuggestionEdit } from '../../types/social';

/** One ingredient or step edit as a diff row (RL-149; reused by the thread screen). A general note is not a row. */
export function SuggestionDiffRow({ edit, thread }: { edit: SuggestionEdit; thread?: boolean }) {
  if (edit.kind === 'general') return null;
  const step = edit.kind === 'step';
  const from = edit.from.trim();
  const sentence = step
    ? `Change step ${(edit.index ?? 0) + 1} to: ${edit.to.trim()}`
    : from
      ? `Change ${edit.name?.trim() || 'ingredient'} from ${from} to ${edit.to.trim()}`
      : `Add ${edit.name?.trim() || 'ingredient'}: ${edit.to.trim()}`;
  return (
    <div
      className={`flex gap-2.5 bg-accent-100 text-text-primary ${thread ? 'rounded-[18px] px-3.5 py-2.5 text-[15px]' : 'rounded-2xl px-3 py-2 text-sm'}`}
    >
      <span className="sr-only">{sentence}</span>
      {thread && (
        <b aria-hidden="true" className="shrink-0 text-accent-800">
          ~
        </b>
      )}
      {step ? (
        <>
          <b aria-hidden="true" className="shrink-0">Step {(edit.index ?? 0) + 1}</b>
          <span aria-hidden="true" className="line-clamp-2 min-w-0 flex-1 break-words">{edit.to}</span>
        </>
      ) : (
        <>
          <b aria-hidden="true" className="shrink-0">{edit.to}</b>
          <span aria-hidden="true" className="min-w-0 flex-1 break-words">{edit.name}</span>
          {from && (
            <s aria-hidden="true" className="shrink-0 text-xs text-neutral-700">
              {from}
            </s>
          )}
        </>
      )}
    </div>
  );
}
