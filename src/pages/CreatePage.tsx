import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Sparkles } from '../components/ui/icons';
import { DEFAULT_SELECTION, buildCreatePrompt, cycleWord, selectedWords, type CreateSlot } from '../lib/createPrompt';

/**
 * `/new`, the Create tab (Organic 6c, RL-125). Each underlined word cycles through three
 * options; Write it fills the chat composer with the sentence, unsent.
 */
export function CreatePage() {
  const navigate = useNavigate();
  const hintId = useId();
  const [selection, setSelection] = useState(DEFAULT_SELECTION);
  const words = selectedWords(selection);

  const word = (slot: CreateSlot) => (
    <button
      type="button"
      onClick={() => setSelection((s) => cycleWord(s, slot))}
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
        I want something {word(0)} with {word(1)} for {word(2)}.
      </h1>
      <p className="sr-only" aria-live="polite">
        {`I want something ${words[0]} with ${words[1]} for ${words[2]}.`}
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
          onClick={() => navigate('/create', { state: { suggestion: buildCreatePrompt(selection) } })}
          className="h-14 gap-2"
        >
          <Sparkles className="size-5" />
          Write it
        </Button>
        <Button variant="ghost" onClick={() => navigate('/search')} className="h-11">
          Describe it my own way
        </Button>
      </div>
    </div>
  );
}
