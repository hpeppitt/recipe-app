import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Ingredient, Recipe } from '../../types/recipe';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ArrowRight, MessageCircle, Send, X } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { composeSuggestionMessage, MAX_EDIT_FROM, MAX_EDIT_NAME, MAX_EDIT_TO, MAX_EDITS, MAX_MESSAGE, MAX_NOTE, MAX_WHY, parseAmountText } from '../../lib/suggestion';
import type { SuggestionEdit } from '../../types/social';
import { formatAmount } from '../../lib/amount';
import { formatUnit } from '../../lib/units';
import { formatTime, pluralize } from '../../lib/utils';
import { rateLimitMessage } from '../../lib/errors';

interface SuggestModeProps {
  recipe: Recipe;
  /** Sends the structured edits and the composed message through the existing submit; rejects on failure. */
  onSend: (suggestion: { message: string; edits: SuggestionEdit[] }) => Promise<void>;
  /** Leave without sending. */
  onCancel: () => void;
  /** The send landed. */
  onSent: () => void;
}

interface Draft {
  /** ingredient: the new amount; step: the new text; general: the note. */
  text: string;
  /** What `text` started as, so an untouched card can be dismissed with Escape. */
  base: string;
  why: string;
}

/** The amount and unit as the recipe shows them, e.g. "2 cloves". Empty when the ingredient has neither. */
function shownAmount(ing: Ingredient): string {
  const amount = typeof ing.amount === 'number' ? ing.amount : null;
  return [amount != null ? formatAmount(amount) : '', formatUnit(ing.unit, amount) ?? '']
    .filter(Boolean)
    .join(' ');
}

const input = 'min-w-0 bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none';
const card =
  'my-1.5 -mx-2.5 rounded-[24px] bg-accent-100 p-3 text-neutral-800 shadow-[inset_0_0_0_2px_var(--color-accent-700)]';
const rowClass =
  'flex min-h-11 w-full items-center gap-3 border-b border-text-primary/8 py-[9px] text-left text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700';
const undoClass =
  "relative ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700";
const area = `${input} mt-2 block w-full resize-none rounded-[18px] px-3.5 py-2.5 text-[14px]`;
/** Firestore rejects undefined, so an empty why is left out. */
const whyOf = (d: Draft) => (d.why.trim() ? { why: d.why.trim() } : {});
const AMOUNT_HELP = 'Use a number, and a unit if it has one, like 80 g';
const STEP_TOO_LONG = 'This step is too long to suggest on';

/**
 * Suggest mode (9b): the recipe page becomes the form. Tap an ingredient to
 * propose a new amount, a method step to propose new text, or the General note
 * row for anything else. The result is structured edits plus the free-text
 * message they compose to. Draft keys are `i<n>`, `s<n>` and `g`. Mount it
 * with a key of the recipe id so drafts do not carry to another recipe.
 */
export function SuggestMode({ recipe, onSend, onCancel, onSent }: SuggestModeProps) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const name = recipe.createdBy?.displayName?.trim();
  const author = name || 'the author';
  const authorFirst = name ? name.split(/\s+/)[0] : author;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Amount fields the visitor has left, so the parse help does not appear mid-typing.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const focusNext = useRef<{ k: string; target: 'row' | 'field' } | null>(null);

  // Focus moves after the render that opens or closes an editor.
  useLayoutEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    (next.target === 'field' ? fieldRefs.current[next.k] : rowRefs.current[next.k])?.focus();
  });

  // After a failed send, move focus to the message so a screen reader hears it.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const edits: SuggestionEdit[] = [];
  const invalid = new Map<string, string>();
  ingredients.forEach((ing, i) => {
    const d = drafts[`i${i}`];
    const from = shownAmount(ing);
    const to = d?.text.trim();
    if (!to || to === from) return;
    if (to.length > MAX_EDIT_TO) invalid.set(`i${i}`, `Keep it under ${MAX_EDIT_TO} characters`);
    else if (!parseAmountText(to)) invalid.set(`i${i}`, AMOUNT_HELP);
    else edits.push({ kind: 'ingredient', index: i, name: ing.name.slice(0, MAX_EDIT_NAME), from, to, ...whyOf(d) });
  });
  steps.forEach((step, i) => {
    const d = drafts[`s${i}`];
    const to = d?.text.trim();
    if (!to || to === step.text.trim()) return;
    if (step.text.length > MAX_EDIT_FROM) invalid.set(`s${i}`, STEP_TOO_LONG);
    else if (to.length > MAX_EDIT_TO) invalid.set(`s${i}`, `Keep it under ${MAX_EDIT_TO} characters`);
    else edits.push({ kind: 'step', index: i, from: step.text, to, ...whyOf(d) });
  });
  const noteText = drafts.g?.text.trim();
  if (noteText) edits.push({ kind: 'general', from: '', to: noteText });
  const message = composeSuggestionMessage(edits);
  const changes = edits.length;
  const hasWork = changes > 0;
  const tooLong = message.length > MAX_MESSAGE;
  const tooMany = changes > MAX_EDITS;
  const blocked = !hasWork || tooLong || tooMany || invalid.size > 0;
  // Parse help waits for blur; the length problems show at once.
  const problem = (k: string) => {
    const m = invalid.get(k);
    return m && (m !== AMOUNT_HELP || touched[k]) ? m : undefined;
  };
  const limitMessage = tooLong
    ? `Your suggestion is ${message.length} characters, over the ${MAX_MESSAGE} limit. Shorten it to send.`
    : tooMany
      ? `A suggestion can hold ${MAX_EDITS} changes. Undo ${changes - MAX_EDITS} to send.`
      : '';

  const open = (k: string, text: string) => {
    if (drafts[k]) {
      fieldRefs.current[k]?.focus();
      return;
    }
    focusNext.current = { k, target: 'field' };
    setDrafts((d) => ({ ...d, [k]: { text, base: text, why: '' } }));
  };
  const undo = (k: string) => {
    focusNext.current = { k, target: 'row' };
    setTouched((t) => ({ ...t, [k]: false }));
    setDrafts((d) => {
      const { [k]: _removed, ...rest } = d;
      return rest;
    });
  };
  const patch = (k: string, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [k]: { ...d[k], ...p } }));

  const undoButton = (k: string) => (
    <button type="button" aria-label="Undo this change" onClick={() => undo(k)} className={undoClass}>
      <X className="h-4 w-4" />
    </button>
  );
  const whyInput = (k: string) => (
    <input
      aria-label="Why?"
      placeholder="Why? (optional)"
      value={drafts[k].why}
      maxLength={MAX_WHY}
      onChange={(e) => patch(k, { why: e.target.value })}
      className={`${input} mt-2 block min-h-11 w-full rounded-[18px] px-3.5 py-2.5 text-[14px]`}
    />
  );
  // Escape only dismisses a card with nothing typed in it; the X is the explicit undo.
  const escape = (k: string) => (e: KeyboardEvent) => {
    const d = drafts[k];
    if (e.key === 'Escape' && d && d.text === d.base && !d.why) undo(k);
  };
  const setRef = (k: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    fieldRefs.current[k] = el;
  };
  const setRow = (k: string) => (el: HTMLButtonElement | null) => {
    rowRefs.current[k] = el;
  };

  const send = async () => {
    if (blocked || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await onSend({ message, edits });
      onSent();
    } catch (err) {
      console.error('Submitting the suggestion failed', err);
      setError(rateLimitMessage(err) ?? "That didn't send. Check your connection and try again.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const cancel = () => (sending ? undefined : Object.keys(drafts).length > 0 && (hasWork || invalid.size > 0) ? setConfirmDiscard(true) : onCancel());

  const byLine = [
    recipe.totalTime > 0 ? formatTime(recipe.totalTime) : null,
    `${recipe.servings} ${pluralize(recipe.servings, 'serving')}`,
  ].filter(Boolean);

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <div className="px-4 pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 rounded-full bg-accent-2-700 py-2.5 pr-2.5 pl-4 text-[13px] font-semibold text-accent-2-100">
          <MessageCircle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 break-words">Tap any line to suggest a change</p>
          <button
            type="button"
            onClick={cancel}
            disabled={sending}
            className="relative h-8 shrink-0 rounded-full bg-accent-2-100 px-3.5 font-semibold text-accent-2-900 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2-100 disabled:opacity-45"
          >
            Cancel
          </button>
        </div>
      </div>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-6">
        <h1 className="mt-4 break-words font-heading text-[28px] leading-tight text-text-primary">{recipe.title}</h1>
        <p className="mt-1 break-words text-[13px] text-text-tertiary">
          by {author} · {byLine.join(' · ')}
        </p>

        <h2 className="mt-6 font-heading text-[20px] leading-tight text-text-primary">Ingredients</h2>
        <ul className="mt-2">
          {ingredients.map((ing, i) => {
            const k = `i${i}`;
            const draft = drafts[k];
            const old = shownAmount(ing);
            const showGroup = ing.group && ing.group !== ingredients[i - 1]?.group;
            return (
              <li key={i}>
                {showGroup && (
                  <h3 className="mt-3 mb-1 break-words text-[14px] font-semibold text-text-secondary">{ing.group}</h3>
                )}
                <button
                  type="button"
                  ref={setRow(k)}
                  aria-label={`Suggest a change to ${[old, ing.name].filter(Boolean).join(' ')}`}
                  aria-expanded={!!draft}
                  onClick={() => open(k, old)}
                  className={rowClass}
                >
                  <span className="min-w-[62px] shrink-0 font-bold">{old}</span>
                  <span className="min-w-0 flex-1 break-words text-text-primary">{ing.name}</span>
                </button>
                {draft && (
                  <div role="group" aria-label={`Change ${ing.name}`} className={card} onKeyDown={escape(k)}>
                    <div className="flex flex-wrap items-center gap-2 text-[15px]">
                      <span className="min-w-0 break-words text-neutral-700 line-through">{old || 'no amount'}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-neutral-700" />
                      <input
                        ref={setRef(k)}
                        aria-label="New amount"
                        maxLength={MAX_EDIT_TO}
                        aria-invalid={problem(k) ? true : undefined}
                        aria-describedby={problem(k) ? `${k}-help` : undefined}
                        onBlur={() => setTouched((t) => ({ ...t, [k]: true }))}
                        value={draft.text}
                        onChange={(e) => patch(k, { text: e.target.value })}
                        className={`${input} h-11 w-[84px] rounded-full px-3 font-bold shadow-[inset_0_0_0_1.5px_var(--color-accent-700)]`}
                      />
                      {undoButton(k)}
                    </div>
                    {problem(k) && (
                      <p id={`${k}-help`} role="alert" className="mt-2 break-words text-[13px] text-danger-700">
                        {problem(k)}
                      </p>
                    )}
                    {whyInput(k)}
                    {draft.why.trim() && !invalid.has(k) && !edits.some((e) => e.kind === 'ingredient' && e.index === i) && (
                      <p className="mt-2 break-words text-[13px] text-neutral-700">
                        Change the amount to include this suggestion, or put it in a general note.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {steps.length > 0 && (
          <>
            <h2 className="mt-6 font-heading text-[20px] leading-tight text-text-primary">Method</h2>
            <ol className="mt-2">
              {steps.map((step, i) => {
                const k = `s${i}`;
                const draft = drafts[k];
                return (
                  <li key={i}>
                    <button
                      type="button"
                      ref={setRow(k)}
                      aria-label={`Suggest a change to step ${i + 1}: ${step.text}`}
                      aria-expanded={!!draft}
                      onClick={() => open(k, step.text)}
                      className={`${rowClass} items-start`}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-secondary font-heading text-[14px] text-text-primary"
                      >
                        {step.step}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-text-primary">{step.text}</span>
                    </button>
                    {draft && (
                      <div role="group" aria-label={`Change step ${i + 1}`} className={card} onKeyDown={escape(k)}>
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 break-words text-[13px] text-neutral-700 line-through">{step.text}</p>
                          {undoButton(k)}
                        </div>
                        <textarea
                          ref={setRef(k)}
                          aria-label="New step text"
                          rows={3}
                          maxLength={MAX_EDIT_TO}
                          value={draft.text}
                          onChange={(e) => patch(k, { text: e.target.value })}
                          className={area}
                        />
                        {problem(k) && (
                          <p role="alert" className="mt-2 break-words text-[13px] text-danger-700">
                            {problem(k)}
                          </p>
                        )}
                        {whyInput(k)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="mt-2">
          <button
            type="button"
            ref={setRow('g')}
            aria-expanded={!!drafts.g}
            onClick={() => open('g', '')}
            className={rowClass}
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 break-words text-text-primary">
              <span className="font-bold">General note</span>
              {noteText && (
                <>
                  {' '}
                  <span className="block truncate text-[13px] text-text-tertiary">{noteText.split('\n')[0]}</span>
                </>
              )}
            </span>
          </button>
          {drafts.g && (
            <div role="group" aria-label={`Note for ${author}`} className={card} onKeyDown={escape('g')}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[13px] text-neutral-700">Note for {author}</p>
                {undoButton('g')}
              </div>
              <textarea
                ref={setRef('g')}
                aria-label="General note text"
                rows={3}
                maxLength={MAX_NOTE}
                placeholder="Anything that is not one line"
                value={drafts.g.text}
                onChange={(e) => patch('g', { text: e.target.value })}
                className={area}
              />
            </div>
          )}
        </div>
      </main>

      <div className="sticky bottom-0 bg-surface px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--color-border)]">
        <div className="mx-auto max-w-lg">
          <p role="status" className={limitMessage ? 'mb-3 break-words text-sm text-danger-700' : 'sr-only'}>
            {limitMessage}
          </p>
          {error && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="mb-3 break-words text-sm text-danger-700 focus:outline-none">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2.5">
            <p aria-live="polite" className="min-w-0 flex-1 break-words text-[13px] text-text-tertiary">
              {changes === 0 ? (
                'Tap any line to change it'
              ) : (
                <>
                  <b>
                    {changes} {pluralize(changes, 'change')}
                  </b>{' '}
                  to suggest
                </>
              )}
            </p>
            <button
              type="button"
              onClick={send}
              disabled={blocked || sending}
              className="inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary-600 px-[22px] font-heading text-[15px] whitespace-nowrap text-on-accent hover:bg-primary-700 active:bg-primary-800 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              {sending ? <span aria-hidden="true"><Spinner size="sm" /></span> : <Send className="h-4 w-4" />}
              Send to <span className="max-w-[9rem] truncate">{authorFirst}</span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your suggestion?"
        message="Your changes will be lost."
        confirmLabel="Discard"
        confirmVariant="danger"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onCancel();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
