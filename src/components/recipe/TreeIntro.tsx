import { useRef } from 'react';
import { Button } from '../ui/Button';

/**
 * Teaches the one idea the whole app is built on: changing a recipe makes a new
 * version rather than overwriting it. Redrawn in the 16a language (RL-114).
 *
 * The diagram is a scaled 3a: same line width and colours as
 * `components/tree/TreeView.tsx` (RL-068), smaller elbow (14px) and indent
 * (36px) so it fits a 320px card. It is decorative
 * (`aria-hidden`); the visually hidden sentence is its only description.
 *
 * @param onDismiss Records it as seen. There is no "remind me later": either the
 *   idea landed or it did not, and re-showing it is nagging.
 * @param onOpenTree Optional. Offered only when this recipe actually has
 *   variations, since sending someone to a tree with one node teaches nothing.
 */
const STEPS = [
  'Someone asks for a change, like "less sugar".',
  'A new version grows off it. The original never changes.',
  'The terracotta line shows how you got here.',
];

const NODE = 'min-w-0 break-words rounded-[18px] bg-surface px-3 py-[7px] text-xs font-bold text-text-primary';
const RAIL = 'absolute left-0 top-0 bottom-0 border-l-[3px] border-neutral-400';
// bottom is half the row minus the 8px top padding, less half the 3px line, so the
// elbow's line meets the node's vertical centre whether the node wraps or not.
const ELBOW =
  'absolute top-0 bottom-[calc(50%-5.5px)] w-3.5 rounded-bl-[12px] border-b-[3px] border-l-[3px]';

export function TreeIntro({
  onDismiss,
  onOpenTree,
}: {
  onDismiss: () => void;
  onOpenTree?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  // Got it removes this card, which would drop focus to the body. Hand it to the
  // enclosing <main> instead so the next Tab starts at the recipe.
  const gotIt = () => {
    const main = ref.current?.closest('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.style.outline = 'none';
      main.focus({ preventScroll: true });
      main.addEventListener(
        'blur',
        () => {
          main.removeAttribute('tabindex');
          main.style.outline = '';
        },
        { once: true }
      );
    }
    onDismiss();
  };

  return (
    <section
      ref={ref}
      aria-labelledby="tree-intro-heading"
      className="flex flex-col gap-4 rounded-card bg-surface p-4 shadow-md"
    >
      <div aria-hidden="true" className="rounded-[28px] bg-surface-secondary px-3.5 py-4">
        <div className="flex items-center gap-2.5 rounded-[20px] bg-surface px-3 py-2">
          <span className="text-[18px]">🍞</span>
          <span className="min-w-0 flex-1 break-words text-[13px] font-bold">Banana bread</span>
          <span className="text-[11px] text-text-tertiary">Original</span>
        </div>
        <div className="ml-[26px]">
          <div className="relative pt-2">
            <span className={RAIL} />
            <span className={`${ELBOW} left-0 border-accent`} />
            <div className="ml-[18px] flex">
              <span className={NODE}>"less sugar"</span>
            </div>
          </div>
          <div className="relative pt-2">
            <span className={RAIL} />
            <span className={`${ELBOW} left-9 border-accent`} />
            <div className="ml-[54px] flex items-center gap-2">
              <span className={`${NODE} flex-1 shadow-[0_0_0_2px_var(--color-accent)]`}>
                "extra banana"
              </span>
              <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-on-accent">
                Here
              </span>
            </div>
          </div>
          <div className="relative pt-2">
            <span className={`${ELBOW} left-0 border-neutral-400`} />
            <div className="ml-[18px] flex">
              <span className={NODE}>"add chocolate"</span>
            </div>
          </div>
        </div>
      </div>
      <h2
        id="tree-intro-heading"
        className="font-heading text-[24px] leading-[1.1] text-text-primary"
      >
        Every recipe can grow branches
      </h2>
      <p className="sr-only">
        An original recipe with two branches; one branch has its own branch, marked Here.
      </p>

      <ol role="list" className="flex flex-col gap-2.5 text-sm text-text-primary">
        {STEPS.map((text, i) => (
          <li key={text} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-2-200 text-xs font-bold text-accent-2-800"
            >
              {i + 1}
            </span>
            <span className="min-w-0 break-words">{text}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        <Button fullWidth style={{ minHeight: 52 }} onClick={gotIt}>
          Got it
        </Button>
        {onOpenTree && (
          <Button
            fullWidth
            variant="secondary"
            onClick={() => {
              onDismiss();
              onOpenTree();
            }}
          >
            See the tree
          </Button>
        )}
      </div>
    </section>
  );
}
