import { useLayoutEffect, useRef, useState } from 'react';
import type { Ingredient, Recipe } from '../../types/recipe';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ArrowRight, MessageCircle, Send, X } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { composeSuggestionMessage, MAX_MESSAGE, MAX_NOTE, MAX_WHY, type IngredientEdit } from '../../lib/suggestion';
import { formatAmount } from '../../lib/amount';
import { formatUnit } from '../../lib/units';
import { formatTime, pluralize } from '../../lib/utils';
import { rateLimitMessage } from '../../lib/errors';

interface SuggestModeProps {
  recipe: Recipe;
  /** Sends the composed message through the existing submit; rejects on failure. */
  onSend: (message: string) => Promise<void>;
  /** Leave without sending. */
  onCancel: () => void;
  /** The send landed. */
  onSent: () => void;
}

interface Draft {
  amount: string;
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

/**
 * Suggest mode (9b): the recipe page becomes the form. Tap an ingredient to
 * propose a new amount; edits and the note are composed into the free-text
 * message a suggestion already is, so the write path is unchanged. Mount it
 * with a key of the recipe id so drafts do not carry to another recipe.
 */
export function SuggestMode({ recipe, onSend, onCancel, onSent }: SuggestModeProps) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const name = recipe.createdBy?.displayName?.trim();
  const author = name || 'the author';
  const authorFirst = name ? name.split(/\s+/)[0] : author;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const rowRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const amountRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusNext = useRef<{ i: number; target: 'row' | 'amount' } | null>(null);

  // Focus moves after the render that opens or closes an editor.
  useLayoutEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    (next.target === 'amount' ? amountRefs.current[next.i] : rowRefs.current[next.i])?.focus();
  });

  const edits: IngredientEdit[] = Object.entries(drafts).map(([i, d]) => ({
    name: ingredients[Number(i)].name,
    oldAmount: shownAmount(ingredients[Number(i)]),
    newAmount: d.amount,
    why: d.why,
  }));
  const message = composeSuggestionMessage(edits, note);
  const changes = edits.filter((e) => composeSuggestionMessage([e]) !== '').length;
  const hasWork = message !== '';
  const tooLong = message.length > MAX_MESSAGE;

  const open = (i: number) => {
    if (drafts[i]) {
      amountRefs.current[i]?.focus();
      return;
    }
    focusNext.current = { i, target: 'amount' };
    setDrafts((d) => ({ ...d, [i]: { amount: shownAmount(ingredients[i]), why: '' } }));
  };
  const undo = (i: number) => {
    focusNext.current = { i, target: 'row' };
    setDrafts((d) => {
      const { [i]: _removed, ...rest } = d;
      return rest;
    });
  };
  const patch = (i: number, p: Partial<Draft>) => setDrafts((d) => ({ ...d, [i]: { ...d[i], ...p } }));

  const send = async () => {
    if (!hasWork || tooLong || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await onSend(message);
      onSent();
    } catch (err) {
      console.error('Submitting the suggestion failed', err);
      setError(rateLimitMessage(err) ?? "That didn't send. Check your connection and try again.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const cancel = () => (sending ? undefined : hasWork ? setConfirmDiscard(true) : onCancel());

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
            const draft = drafts[i];
            const old = shownAmount(ing);
            const showGroup = ing.group && ing.group !== ingredients[i - 1]?.group;
            return (
              <li key={i}>
                {showGroup && (
                  <h3 className="mt-3 mb-1 break-words text-[14px] font-semibold text-text-secondary">{ing.group}</h3>
                )}
                <button
                  type="button"
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  aria-label={`Suggest a change to ${ing.name}`}
                  aria-expanded={!!draft}
                  onClick={() => open(i)}
                  className="flex min-h-11 w-full items-center gap-3 border-b border-text-primary/8 py-[9px] text-left text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
                >
                  <span className="min-w-[62px] shrink-0 font-bold">{old}</span>
                  <span className="min-w-0 flex-1 break-words text-text-primary">{ing.name}</span>
                </button>
                {draft && (
                  <div
                    role="group"
                    aria-label={`Change ${ing.name}`}
                    className="my-1.5 -mx-2.5 rounded-[24px] bg-accent-100 p-3 text-neutral-800 shadow-[inset_0_0_0_2px_var(--color-accent-700)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') undo(i);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[15px]">
                      <span className="min-w-0 break-words text-neutral-700 line-through">{old || 'no amount'}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-neutral-700" />
                      <input
                        ref={(el) => {
                          amountRefs.current[i] = el;
                        }}
                        aria-label="New amount"
                        value={draft.amount}
                        onChange={(e) => patch(i, { amount: e.target.value })}
                        className={`${input} h-11 w-[84px] rounded-full px-3 font-bold shadow-[inset_0_0_0_1.5px_var(--color-accent-700)]`}
                      />
                      <button
                        type="button"
                        aria-label="Undo this change"
                        onClick={() => undo(i)}
                        className="relative ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      aria-label="Why?"
                      placeholder="Why? (optional)"
                      value={draft.why}
                      maxLength={MAX_WHY}
                      onChange={(e) => patch(i, { why: e.target.value })}
                      className={`${input} mt-2 block min-h-11 w-full rounded-[18px] px-3.5 py-2.5 text-[14px]`}
                    />
                    {draft.why.trim() && composeSuggestionMessage([{ name: ing.name, oldAmount: old, newAmount: draft.amount }]) === '' && (
                      <p className="mt-2 break-words text-[13px] text-neutral-700">
                        Change the amount to include this suggestion, or put it in your note.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <label className="mt-6 block break-words text-[14px] font-semibold text-text-secondary" htmlFor="suggest-note">
          Note for {author} (optional)
        </label>
        <textarea
          id="suggest-note"
          rows={3}
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything that is not one line, like a method step"
          className={`${input} mt-1.5 block w-full resize-none rounded-[18px] border border-border px-3.5 py-2.5 text-[14px] focus-visible:border-accent-700`}
        />
      </main>

      <div className="sticky bottom-0 bg-surface px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--color-border)]">
        <div className="mx-auto max-w-lg">
          {tooLong && (
            <p role="status" className="mb-3 break-words text-sm text-danger-700">
              Your suggestion is {message.length} characters, over the {MAX_MESSAGE} limit. Shorten it to send.
            </p>
          )}
          {error && (
            <p role="alert" className="mb-3 break-words text-sm text-danger-700">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2.5">
            <p className="min-w-0 flex-1 break-words text-[13px] text-text-tertiary">
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
              disabled={!hasWork || tooLong || sending}
              className="inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary-600 px-[22px] font-heading text-[15px] whitespace-nowrap text-on-accent hover:bg-primary-700 active:bg-primary-800 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              {sending ? <span aria-hidden="true"><Spinner size="sm" /></span> : <Send className="h-4 w-4" />}
              Send to {authorFirst}
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
