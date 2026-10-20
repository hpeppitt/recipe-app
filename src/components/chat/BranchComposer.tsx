import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Recipe } from '../../types/recipe';
import { RecipeContent } from '../recipe/RecipeContent';
import { BRANCH_CHIPS } from '../../lib/constants';
import { appendClause } from '../../lib/utils';
import { ChevronDown, GitBranchPlus, ImagePlus, ShieldCheck, Sparkles } from '../ui/icons';
import {
  ACCEPTED_IMAGE_TYPES,
  attachmentErrorMessage,
  type AttachmentRejection,
  type ImageAttachment,
} from '../../lib/imageAttachments';
import { PhotoTray } from './PhotoTray';
import { usePhotoTray } from './usePhotoTray';

interface BranchComposerProps {
  parent: Recipe;
  /** Prefill from approving a suggestion (RL-017). Read once at mount; the page keys on it. */
  seed?: string;
  generating: boolean;
  /** Shown above the form, and disables Grow. */
  unavailableNotice?: ReactNode;
  /** Text may be empty when photos are attached. May resolve to a limit reason: nothing was sent. */
  onGrow: (
    instruction: string,
    images: ImageAttachment[]
  ) => void | Promise<AttachmentRejection | null>;
}

const isCoarsePointer = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/** The 6b first screen of /recipe/:id/vary: one instruction, quick chips, Grow this branch. */
export function BranchComposer({
  parent,
  seed = '',
  generating,
  unavailableNotice,
  onGrow,
}: BranchComposerProps) {
  const [text, setText] = useState(seed);
  const [expanded, setExpanded] = useState(false);
  const [caretTick, setCaretTick] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const sentRef = useRef(false);
  const tray = usePhotoTray();
  const { fileRef, attachRef, trayRef, mounted } = tray;
  const headingId = useId();
  const previewId = useId();

  const title = parent.title.trim() || 'This recipe';
  const canGrow =
    (!!text.trim() || tray.ready.length > 0) &&
    !tray.preparing &&
    !generating &&
    !unavailableNotice;

  // As ChatInput: autofocus only on a pointer device, since on touch it would
  // open the keyboard over the chips. The caret goes to the end of any seed.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || isCoarsePointer()) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, []);

  // After a chip tap the button took focus; give it back with the caret at the end.
  useLayoutEffect(() => {
    const box = boxRef.current;
    // Not on touch: refocusing would open the keyboard over the other chips and Grow.
    if (!box || caretTick === 0 || isCoarsePointer()) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, [caretTick]);

  useEffect(() => {
    if (!generating) sentRef.current = false;
  }, [generating]);

  const grow = () => {
    const instruction = text.trim();
    if (!canGrow || sentRef.current) return;
    sentRef.current = true;
    // The composer keeps its text and photos while a send runs (the page swaps
    // screens on success), so a refusal only needs Grow unlocked and the copy shown.
    const restore = (msg: string | null) => {
      sentRef.current = false;
      if (msg && mounted.current) tray.setError(msg);
    };
    void Promise.resolve(onGrow(instruction, tray.ready)).then(
      (limit) => {
        if (limit) restore(attachmentErrorMessage(limit));
      },
      () => restore(null)
    );
    tray.setError(null);
  };

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-lg min-w-0 flex-col gap-4 px-[22px] pt-1.5 pb-3">
          {unavailableNotice}

          <div className="flex min-w-0 flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              aria-controls={previewId}
              className="flex min-h-11 max-w-full min-w-0 items-center gap-2.5 rounded-full bg-surface-secondary py-2 pr-3.5 pl-2 text-[13px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span
                aria-hidden="true"
                className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-surface text-base"
              >
                {parent.emoji || '🍽️'}
              </span>
              <span className="min-w-0 truncate">
                Branching <b>{parent.title.trim() || 'this recipe'}</b>
              </span>
              <ChevronDown
                className={`size-4 flex-shrink-0 text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            <div
              id={previewId}
              hidden={!expanded}
              className="w-full min-w-0 break-words rounded-2xl border border-border p-4"
            >
              {expanded && <RecipeContent recipe={parent} compact />}
            </div>
          </div>

          <h2
            id={headingId}
            className="font-heading text-[30px] leading-[1.05] text-text-primary break-words"
          >
            What would you change?
          </h2>

          <textarea
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-labelledby={headingId}
            placeholder="e.g. less sugar, and add walnuts"
            className="min-h-[110px] w-full min-w-0 resize-none rounded-[26px] border-[1.5px] border-primary-600 bg-surface-secondary px-[18px] py-3.5 text-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          />

          <PhotoTray photos={tray.photos} trayRef={trayRef} onRemove={tray.removePhoto} />
          {tray.error && (
            <p
              key={tray.errorSeq}
              role="alert"
              className="min-w-0 break-words text-[13px] text-accent-900"
            >
              {tray.error}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={tray.handlePick}
            className="hidden"
          />

          <div className="flex flex-wrap gap-x-2">
            <button
              ref={attachRef}
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={generating || !!unavailableNotice || tray.full}
              className="flex h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3.5 text-sm text-text-secondary">
                <ImagePlus className="size-4" />
                Add photos
              </span>
            </button>
            {BRANCH_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setText((t) => appendClause(t, chip.toLowerCase()));
                  setCaretTick((n) => n + 1);
                }}
                className="flex h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
              >
                <span className="flex h-9 items-center whitespace-nowrap rounded-full bg-accent-200 px-3.5 text-sm text-accent-900">
                  {chip}
                </span>
              </button>
            ))}
          </div>

          <p className="flex min-w-0 items-start gap-2.5 text-[13px] text-text-tertiary">
            <ShieldCheck className="mt-0.5 size-4 flex-shrink-0" />
            <span className="min-w-0 break-words">
              {title} stays exactly as it is. Yours becomes a new version in its family, credited
              to you.
            </span>
          </p>
        </div>
      </main>

      <div className="sticky bottom-0 bg-surface px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            onClick={grow}
            disabled={!canGrow}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-primary-600 font-heading text-base text-on-accent transition-all hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
          >
            <GitBranchPlus className="size-5" />
            Grow this branch
          </button>
        </div>
      </div>
    </>
  );
}

/** First-turn card shown in place of the typing indicator. Decorative: the page's live region says it. */
export function GrowingCard() {
  return (
    <div
      aria-hidden="true"
      className="flex min-w-0 flex-col gap-2.5 rounded-[28px] bg-surface-secondary p-4"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
        <Sparkles className="size-4 flex-shrink-0" />
        Growing your branch…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        <span className="h-3.5 w-[60%] rounded-full bg-neutral-300" />
        <span className="h-2.5 w-[85%] rounded-full bg-neutral-200" />
        <span className="h-2.5 w-[70%] rounded-full bg-neutral-200" />
      </div>
    </div>
  );
}
