import { useEffect, useRef, useState } from 'react';
import type { ImportDest, ImportEdits, ImportPreview } from '../../hooks/useImportRecipe';
import { badAmountRows, fromReviewRows, reviewSummary, toReviewRows } from '../../lib/linkImport';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Spinner } from '../ui/Spinner';
import { UserPill } from '../ui/UserPill';
import { Check } from '../ui/icons';
import { pluralize } from '../../lib/utils';
import { IngredientRow } from './IngredientRow';

type Choice = 'edit' | 'vary' | 'family';

/** The link's host and path for the source pill; the CSS truncates the rest. */
function sourceLabel(preview: ImportPreview): string {
  try {
    const u = new URL(preview.url);
    return `${preview.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return preview.host;
  }
}

/**
 * "Check the import" (RL-252, 30b): the read recipe before it is saved, with its title and
 * ingredient amounts editable and unclear amounts flagged. Edit first and Save and branch both
 * save a new original (RL-186's save) and then open the editor or the branch composer.
 */
export function ImportReview({
  preview,
  isSaving,
  saveError,
  onSave,
}: {
  preview: ImportPreview;
  isSaving: boolean;
  saveError: string | null;
  onSave: (asBranch: boolean, edits: ImportEdits, dest: ImportDest) => void;
}) {
  const { recipe, family } = preview;
  const [seen, setSeen] = useState(preview);
  const [title, setTitle] = useState(recipe.title);
  const [rows, setRows] = useState(() => toReviewRows(recipe.ingredients));
  // A new read starts a new review; edits to the last one are dropped with it.
  if (seen !== preview) {
    setSeen(preview);
    setTitle(recipe.title);
    setRows(toReviewRows(recipe.ingredients));
  }
  const [choice, setChoice] = useState<Choice | null>(null);
  const [confirm, setConfirm] = useState<Choice | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // A new review takes focus so keyboard and screen reader users land on what was read.
  useEffect(() => {
    headingRef.current?.focus();
  }, [preview]);
  // Button does not forward refs, so the failed save's button is found by its choice.
  useEffect(() => {
    if (saveError && choice) actionsRef.current?.querySelector<HTMLButtonElement>(`[data-choice="${choice}"]`)?.focus();
  }, [saveError, choice]);

  const flagged = rows.filter((r) => r.flagged).length;
  const bad = badAmountRows(rows);
  const [showBad, setShowBad] = useState(false);
  const run = (c: Choice) => {
    setConfirm(null);
    if (isSaving) return;
    setChoice(c);
    onSave(c === 'family', { title, ingredients: fromReviewRows(rows) }, c === 'edit' ? 'edit' : c === 'vary' ? 'vary' : 'recipe');
  };
  const tap = (c: Choice) => {
    if (isSaving) return;
    if (bad.length) return setShowBad(true);
    if (flagged > 0) setConfirm(c);
    else run(c);
  };
  const label = (text: string, mine: boolean) =>
    isSaving && mine ? (
      <>
        <span aria-hidden="true"><Spinner size="sm" className="mr-2" /></span>
        Saving…
      </>
    ) : (
      <span className="truncate">{text}</span>
    );

  return (
    <section aria-label="Check the import" className="space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="font-heading text-[22px] text-text-primary focus:outline-none">
        Check the import
      </h2>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate rounded-full bg-neutral-100 px-3 py-1 text-[13px] text-text-secondary">
          {preview.url === 'photo' ? 'Photo' : sourceLabel(preview)}
        </span>
        {preview.url !== 'photo' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-2-200 px-2 py-1 text-xs font-semibold text-accent-2-900">
            <Check className="size-3" />
            Source kept
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <input
          aria-label="Recipe title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 border-b-2 border-dashed border-accent-400 bg-transparent pb-1 font-heading text-[26px] text-text-primary focus:border-solid focus:border-accent-800 focus:outline-none"
        />
        <span aria-hidden="true" className="text-[26px]">{recipe.emoji}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <IngredientRow
            key={index}
            index={index}
            row={row}
            flagged={row.flagged}
            amountProps={showBad && bad.includes(index) ? { 'aria-invalid': true, 'aria-describedby': 'import-bad-amount' } : undefined}
            onField={(field, value) =>
              setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value, ...(field === 'amount' && { flagged: false }) } : r)))
            }
          />
        ))}
      </div>
      <p className="text-[13px] text-neutral-700">
        {reviewSummary(rows.length, recipe.instructions.length, flagged)}
      </p>
      {family && (
        <section aria-label="Already in the library" className="space-y-2 rounded-[24px] bg-accent-2-100 p-4">
          <p className="text-sm text-text-primary">
            There's already a <strong>{family.title}</strong> family with {family.versions}{' '}
            {pluralize(family.versions, 'version')}
          </p>
          {family.author && <UserPill uid={family.author.uid} name={family.author.name} truncate />}
        </section>
      )}
      {showBad && bad.length > 0 && (
        <p id="import-bad-amount" role="alert" className="px-1 text-sm text-danger-700">
          Amounts must be numbers like 0.5. Fix the marked {pluralize(bad.length, 'amount')} or clear {bad.length === 1 ? 'it' : 'them'}.
        </p>
      )}
      {saveError && (
        <p role="alert" className="px-1 text-sm text-danger-700">
          {saveError}
        </p>
      )}
      <div ref={actionsRef} className="flex flex-col gap-2" aria-busy={isSaving || undefined}>
        <div className="flex gap-2">
          <Button data-choice="edit" variant="secondary" className="flex-1" aria-disabled={isSaving || undefined} onClick={() => tap('edit')}>
            {label('Edit first', choice === 'edit')}
          </Button>
          <Button data-choice="vary" className="flex-1" aria-disabled={isSaving || undefined} onClick={() => tap('vary')}>
            {label('Save and branch', choice === 'vary')}
          </Button>
        </div>
        {family && (
          <Button data-choice="family" fullWidth variant="ghost" aria-disabled={isSaving || undefined} onClick={() => tap('family')}>
            {label(`Add to ${family.title} family`, choice === 'family')}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={`Save with ${flagged} unclear ${pluralize(flagged, 'amount')}?`}
        message="It stays blank until you fill it in."
        confirmLabel="Save"
        onConfirm={() => confirm && run(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
