import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Link as LinkIcon, Sparkles } from '../components/ui/icons';
import { DEFAULT_SELECTION, buildCreatePrompt, createTerms, cycleWord, selectedWords, type CreateSlot } from '../lib/createPrompt';
import { useTasteProfile } from '../hooks/useTasteProfile';

const NO_COOKS: never[] = [];
/** Terms shown before "+N more" (RL-235). */
const SHOWN_TERMS = 3;

/**
 * `/new`, the Create tab (Organic 6c, RL-125). Each underlined word cycles through three
 * options; Write it fills the chat composer with the sentence, unsent. A verified user's avoids and a
 * learned "under 30 min" follow as bold terms (RL-235); a tapped one is dropped for this recipe only.
 */
export function CreatePage() {
  const navigate = useNavigate();
  const hintId = useId();
  const [selection, setSelection] = useState(DEFAULT_SELECTION);
  const words = selectedWords(selection);
  // No cooks: tendToChange comes from the user's own branch prompts, so /new opens no cooks listener.
  const taste = useTasteProfile(NO_COOKS);
  // A failed or refused read shows no terms rather than an error.
  const terms = taste.loading || taste.loadFailed ? [] : createTerms(taste.avoids, taste.tendToChange);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const kept = terms.filter((t) => !dropped.has(t.label));
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? terms : terms.slice(0, SHOWN_TERMS);
  const firstRevealed = useRef<HTMLButtonElement>(null);
  // "+N more" disappears when tapped, so focus moves to the first term it revealed.
  useEffect(() => {
    if (expanded) firstRevealed.current?.focus();
  }, [expanded]);
  // Announces the change only; the sentence itself is read from the h1.
  const [status, setStatus] = useState('');
  const toggle = (label: string) => {
    const off = !dropped.has(label);
    const next = new Set(dropped);
    if (off) next.add(label);
    else next.delete(label);
    setDropped(next);
    setStatus(`${label} ${off ? 'dropped' : 'kept'}`);
  };
  const write = () => {
    const dropAvoids = terms.flatMap((t) => (t.avoid && dropped.has(t.label) ? [t.avoid] : []));
    const suggestion = buildCreatePrompt(selection, kept.map((t) => t.label));
    navigate('/create', { state: dropAvoids.length ? { suggestion, dropAvoids } : { suggestion } });
  };

  const word = (slot: CreateSlot) => (
    <button
      type="button"
      onClick={() => {
        const next = cycleWord(selection, slot);
        setSelection(next);
        setStatus(selectedWords(next)[slot]);
      }}
      aria-describedby={hintId}
      className="inline-block bg-transparent px-0 py-1 -my-1 [font:inherit] text-accent-700 underline decoration-[3px] underline-offset-[6px] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      {words[slot]}
    </button>
  );

  return (
    <div className="relative flex flex-col overflow-clip px-6 pb-6 min-h-[calc(100dvh_-_78px_-_max(8px,env(safe-area-inset-bottom)))] lg:min-h-dvh">
      <div aria-hidden="true" className="absolute -right-[90px] -top-[60px] size-[260px] rounded-full bg-accent-2-200" />
      <p id={hintId} className="relative pt-6 text-[13px] text-text-tertiary">
        Tap the underlined words
      </p>
      <h1 className="relative mt-[30px] font-heading text-[36px] leading-[1.25] text-text-primary">
        I want something {word(0)} with {word(1)} for {word(2)}
        {shown.map(({ label }, i) => {
          const off = dropped.has(label);
          return (
            <span key={label}>
              ,{' '}
              <button
                ref={i === SHOWN_TERMS ? firstRevealed : undefined}
                type="button"
                onClick={() => toggle(label)}
                aria-label={off ? `Keep ${label}` : `Drop ${label} for this recipe`}
                className={`inline-block bg-transparent px-0 py-1 -my-1 [font:inherit] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${off ? 'text-text-tertiary line-through' : 'text-text-primary'}`}
              >
                {/* A span, because [font:inherit] on the button would reset font-weight. */}
                <span className="font-semibold">{label}</span>
              </button>
            </span>
          );
        })}
        {shown.length < terms.length && (
          <>
            ,{' '}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Show ${terms.length - shown.length} more`}
              className="inline-block bg-transparent px-0 py-1 -my-1 [font:inherit] text-text-secondary underline underline-offset-[6px] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              +{terms.length - shown.length} more
            </button>
          </>
        )}
        .
      </h1>
      <p className="sr-only" role="status">
        {status}
      </p>
      <div className="flex-1" />
      {/* Sticky above the nav, so an in-flow banner over the page cannot push the actions under it.
          overflow-clip (not hidden) on the page, because hidden would make it the sticky scroller. */}
      <div
        data-testid="create-actions"
        className="sticky bottom-[calc(78px_+_max(8px,env(safe-area-inset-bottom)))] lg:bottom-0 z-10 flex flex-col gap-2 bg-surface pt-2"
      >
        <Button
          fullWidth
          size="lg"
          onClick={write}
          className="h-14 gap-2"
        >
          <Sparkles className="size-5" />
          Write it
        </Button>
        <Button variant="ghost" onClick={() => navigate('/search')} className="h-11">
          Describe it my own way
        </Button>
        <Button variant="ghost" onClick={() => navigate('/import')} className="h-11 gap-2">
          <LinkIcon className="size-5" />
          Add from a link
        </Button>
      </div>
    </div>
  );
}
