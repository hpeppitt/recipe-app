import { useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Recipe } from '../types/recipe';
import { useRecipe, useRecipeLineage } from '../hooks/useRecipe';
import { useAuth } from '../contexts/AuthContext';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { cacheRecipe, updateRecipe } from '../db/recipes';
import { getPublishedRecipe, publishRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { canManageRecipe } from '../lib/ownership';
import { trackRecipeUpdated } from '../services/analytics';
import { reportError } from '../services/telemetry';
import { withTimeout } from '../lib/utils';
import {
  recipeToDraft,
  validateDraft,
  draftToPatch,
  isDraftDirty,
  EMPTY_INGREDIENT,
  EMPTY_INSTRUCTION,
  type RecipeDraft,
  type DraftErrors,
} from '../lib/recipeEdit';
import { TopBar } from '../components/layout/TopBar';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Clock, Gauge, GitBranch, Pencil, Plus, UserRound, X } from '../components/ui/icons';

/** How long a verified owner's save waits for the cloud check and publish. */
const CLOUD_SAVE_TIMEOUT_MS = 5000;

/** Shown when the cloud copy is gone; there is nothing to retry against. */
const GONE_MESSAGE = 'This recipe is no longer in your account.';

const DIFFICULTIES = [
  { value: 'easy' as const, label: 'Easy' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'hard' as const, label: 'Hard' },
];

/**
 * Pill field styling. Width is deliberately absent: it is set per field, because
 * Tailwind resolves by stylesheet order, so a baked-in `w-full` once defeated the
 * narrow widths on the ingredient row and pushed the name field out of view.
 */
const pill =
  'h-11 rounded-full border border-neutral-400 bg-neutral-100 px-3 text-text-primary ' +
  'placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 ' +
  'focus:border-transparent transition-shadow';

const textareaClasses =
  'w-full rounded-[22px] border border-neutral-400 bg-neutral-100 px-4 py-3 text-[15px] text-text-primary ' +
  'placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 ' +
  'focus:border-transparent transition-shadow';

/** Keeps a focused or scrolled-to field clear of the header and the sticky footer. */
const FOCUS_SCROLL = 'scroll-mt-20 scroll-mb-44';

/**
 * The ingredient rows validateDraft is complaining about, so only those inputs are marked
 * invalid. Keep in step with the ingredient rules in `validateDraft` (lib/recipeEdit.ts):
 * an unnamed non-blank row wins, then a non-numeric or negative amount.
 */
function badIngredientRows(rows: RecipeDraft['ingredients']): { field: 'name' | 'amount'; indexes: number[] } | null {
  const blank = (r: RecipeDraft['ingredients'][number]) =>
    !r.name.trim() && !r.amount.trim() && !r.unit.trim() && !r.notes.trim();
  const unnamed = rows.flatMap((r, i) => (!blank(r) && !r.name.trim() ? [i] : []));
  if (unnamed.length) return { field: 'name', indexes: unnamed };
  const badAmount = rows.flatMap((r, i) => {
    const n = Number(r.amount.trim());
    return r.amount.trim() !== '' && (!Number.isFinite(n) || n < 0) ? [i] : [];
  });
  return badAmount.length ? { field: 'amount', indexes: badAmount } : null;
}

/** The first field a failed Save should land on, in page order (same order as validateDraft's rules). */
function firstInvalidId(errors: DraftErrors, draft: RecipeDraft): string | null {
  if (errors.title) return 'edit-title';
  if (errors.servings) return 'edit-servings';
  if (errors.prepTime) return 'edit-prep';
  if (errors.cookTime) return 'edit-cook';
  if (errors.ingredients) {
    const rows = draft.ingredients;
    const bad = badIngredientRows(rows);
    if (bad) return `ingredient-${bad.indexes[0]}-${bad.field}`;
    return rows.length > 0 ? 'ingredient-0-name' : 'add-ingredient';
  }
  if (errors.instructions) return draft.instructions.length > 0 ? 'step-0' : 'add-step';
  return null;
}

/** A labelled pill holding a number input: icon, short visible label, input. */
function FactPill({
  id,
  label,
  icon,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className={`flex min-h-11 items-center gap-1.5 rounded-full border bg-neutral-100 px-3 py-1.5 text-[13px] text-text-secondary focus-within:ring-2 focus-within:ring-primary-500 ${FOCUS_SCROLL} ${error ? 'border-danger-500' : 'border-neutral-400'}`}
      >
        {icon}
        <span>{label}</span>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-12 min-w-0 bg-transparent text-center text-[13px] font-bold text-text-primary focus:outline-none"
        />
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 px-3 text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

function DashedAddButton({ id, onClick, children }: { id?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-neutral-500 px-3.5 py-[7px] text-sm text-text-secondary hover:bg-surface-secondary"
    >
      <Plus className="h-4 w-4" />
      {children}
    </button>
  );
}

/** A 44px-target remove button for repeatable rows, with a 32px visual. */
function RemoveRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group flex h-11 w-11 shrink-0 items-center justify-center text-text-tertiary hover:text-danger-600"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full group-hover:bg-surface-tertiary">
        <X className="h-4 w-4" />
      </span>
    </button>
  );
}

/**
 * Manual editing for a recipe's owner.
 *
 * A sibling page rather than a mode on `RecipeDetailPage`: that file is already
 * 700 lines and carries share, delete, favourite, suggestion review and four
 * toasts. Editing is also a destination people arrive at deliberately, so it
 * deserves its own URL and its own Back.
 *
 * Edits are in place, on the same recipe id, keeping the recipe's tree position.
 * Every recipe was previously immutable except by a billed AI variation, which
 * punished the most common intent — fix a quantity, reword a step — and polluted
 * the version tree with correction forks.
 */
export function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();
  const { recipe, source, isLoading, cloudError, retry } = useRecipe(id);

  const isOwner = canManageRecipe({
    isConfigured,
    source,
    userUid: user?.uid,
    createdByUid: recipe?.createdBy?.uid,
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Loading..." showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title={cloudError ? 'Could not load' : 'Not found'} showBack />
        <div className="p-8 text-center space-y-3">
          <p className="text-4xl">{cloudError ? '📡' : '🔍'}</p>
          <p className="text-text-secondary">
            {cloudError
              ? 'Could not load this recipe. Check your connection and try again.'
              : 'Recipe not found.'}
          </p>
          {cloudError && <Button onClick={retry}>Try again</Button>}
        </div>
      </div>
    );
  }

  // Fails closed. The rules would reject the write anyway, but sending someone
  // into a form that cannot save is worse than saying so.
  if (!isOwner) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Can't edit" showBack />
        <div className="p-8 text-center space-y-3">
          <p className="text-4xl">🔒</p>
          <p className="text-text-secondary">
            Only the person who added this recipe can edit it. You can suggest a change
            instead.
          </p>
          <Button variant="secondary" onClick={() => navigate(`/recipe/${recipe.id}`)}>
            Back to recipe
          </Button>
        </div>
      </div>
    );
  }

  // Keyed on the recipe id so the form's state is rebuilt by React when the
  // identity changes, rather than by an effect that copies props into state. That
  // effect is the classic derive-state-from-props bug, and it is what the
  // set-state-in-effect lint rule is pointing at.
  return <RecipeEditForm key={recipe.id} recipe={recipe} />;
}

function RecipeEditForm({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const id = recipe.id;

  const [draft, setDraft] = useState<RecipeDraft>(() => recipeToDraft(recipe));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const emojiRef = useRef<HTMLInputElement>(null);
  // Direct children only. While the tree loads nothing is shown, never a wrong count.
  const lineage = useRecipeLineage(recipe);

  const isDirty = isDraftDirty(draft, recipe) && !isSaving;
  const { leave } = useUnsavedGuard(isDirty, () => setShowDiscard(true));

  const update = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const handleBack = () => {
    if (isDirty) {
      setShowDiscard(true);
      return;
    }
    navigate(`/recipe/${id}`);
  };

  const handleSave = async () => {
    if (!recipe || !draft || isSaving) return;

    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveError(null);
      // The ids are static, so the field exists before the error text renders. Centred so
      // neither the header nor the sticky footer covers it; jsdom has no scrollIntoView.
      const target = document.getElementById(firstInvalidId(found, draft) ?? '');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'center' });
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    const patch = draftToPatch(draft, recipe);

    // Verified owner: cloud first (decision 1b). The sync replaces own rows with
    // the server's copy, so a Dexie-only edit would vanish on the next snapshot.
    if (isFirebaseConfigured && user?.emailVerified) {
      const now = Date.now();
      const edited: Recipe = { ...recipe, ...patch, updatedAt: now };
      // Never creates a cloud copy: editing is not a decision to publish. A missing
      // copy means the recipe was deleted on another device. publishRecipe's update
      // path is a merge, so the last write to land wins and counters survive.
      // Bounded because an unreachable Firestore retries instead of rejecting.
      const outcome = await withTimeout<'ok' | 'missing' | 'failed'>(
        getPublishedRecipe(recipe.id)
          .then(async (existing) => {
            if (!existing) return 'missing' as const;
            await publishRecipe(edited);
            return 'ok' as const;
          })
          .catch((err: unknown) => {
            console.error('Saving the recipe edit to the cloud failed; nothing was saved', err);
            return 'failed' as const;
          }),
        CLOUD_SAVE_TIMEOUT_MS,
        'failed'
      );
      if (outcome !== 'ok') {
        setSaveError(
          outcome === 'missing'
            ? GONE_MESSAGE
            : "Couldn't save your changes. Check your connection and try again."
        );
        setIsSaving(false);
        return;
      }

      try {
        await cacheRecipe(edited);
      } catch (err) {
        // The edit is in the cloud, so the save is done; the own-recipe sync
        // (RL-078) fills the row.
        console.error('Caching the edited recipe locally failed', err);
        reportError(err, 'edit-recipe-cache');
      }
      trackRecipeUpdated(recipe.id);
      navigate(`/recipe/${recipe.id}`, { replace: true, state: { saved: 'cloud' } });
      return;
    }

    // Anonymous, signed-out and local-only: Dexie is the only copy.
    try {
      await updateRecipe(recipe.id, patch);
    } catch (err) {
      console.error('Saving the recipe edit locally failed', err);
      setSaveError("Couldn't save your changes. Please try again.");
      setIsSaving(false);
      return;
    }

    trackRecipeUpdated(recipe.id);
    // Reuses the detail page's existing save toast rather than inventing a second
    // confirmation pattern.
    navigate(`/recipe/${recipe.id}`, { replace: true, state: { saved: 'cloud' } });
  };

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <header className="mx-auto flex w-full max-w-lg items-center gap-1.5 px-3 pt-[calc(12px+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleBack}
          disabled={isSaving}
          className="min-h-11 shrink-0 rounded-full px-2.5 text-[15px] text-text-primary hover:bg-surface-secondary disabled:opacity-45"
        >
          Cancel
        </button>
        <h1 className="min-w-0 flex-1 text-center text-sm font-bold text-text-tertiary">Editing</h1>
        <span aria-hidden="true" className="w-[76px] shrink-0" />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1">
        {/* No <form>: an implicit submit from any of the many text inputs would
            save a half-edited recipe. Saving is the explicit button below. */}
        <div className="flex flex-col gap-3.5 px-[22px] pt-2.5 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="min-w-0 flex-1">
              <input
                id="edit-title"
                aria-label="Title"
                value={draft.title}
                onChange={(e) => update('title', e.target.value)}
                aria-invalid={errors.title ? true : undefined}
                aria-describedby={errors.title ? 'edit-title-error' : undefined}
                // accent-600, not the spec's accent-400: 400 is about 1.8:1 on the page and
                // the underline is the only thing that says this is a field.
                className={`${FOCUS_SCROLL} w-full border-b-2 border-dashed bg-transparent pb-1.5 font-heading text-[30px] leading-[1.08] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-solid ${errors.title ? 'border-danger-500 focus:border-danger-700' : 'border-accent-600 focus:border-accent-800'}`}
              />
              {errors.title && (
                <p id="edit-title-error" role="alert" className="mt-1.5 text-sm text-danger-700">
                  {errors.title}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Change emoji"
              onClick={() => emojiRef.current?.focus()}
              className="relative shrink-0 rounded-full"
            >
              <EmojiBlob size={72} emoji={draft.emoji} />
              <span
                aria-hidden="true"
                className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-text-primary text-on-accent"
              >
                <Pencil className="h-[13px] w-[13px]" />
              </span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
            Emoji
            <input
              ref={emojiRef}
              value={draft.emoji}
              onChange={(e) => update('emoji', e.target.value)}
              className={`${pill} w-20 text-center text-xl`}
            />
          </label>

          <div className="space-y-1.5">
            <label htmlFor="description" className="block text-sm font-medium text-text-primary">
              Description
            </label>
            <textarea
              id="description"
              rows={2}
              value={draft.description}
              onChange={(e) => update('description', e.target.value)}
              className={textareaClasses}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FactPill id="edit-servings" label="Servings" icon={<UserRound className="h-4 w-4" />} value={draft.servings} onChange={(v) => update('servings', v)} error={errors.servings} />
            <FactPill id="edit-prep" label="Prep (min)" icon={<Clock className="h-4 w-4" />} value={draft.prepTime} onChange={(v) => update('prepTime', v)} error={errors.prepTime} />
            <FactPill id="edit-cook" label="Cook (min)" icon={<Clock className="h-4 w-4" />} value={draft.cookTime} onChange={(v) => update('cookTime', v)} error={errors.cookTime} />
          </div>
          {/* Total is derived, so it is stated rather than editable: three
              independently editable time fields can disagree with each other. */}
          <p className="-mt-2 text-xs text-text-tertiary">
            Total time is prep plus cook, worked out for you.
          </p>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
              <Gauge className="h-4 w-4" />
              Difficulty
            </span>
            <SegmentedControl
              label="Difficulty"
              options={DIFFICULTIES}
              value={draft.difficulty}
              onChange={(value) => update('difficulty', value)}
            />
          </div>

          <section className="space-y-2">
            <h3 className="mt-1.5 font-heading text-xl text-text-primary">Ingredients</h3>
            {errors.ingredients && (
              <p id="edit-ingredients-error" role="alert" className="text-sm text-danger-700">
                {errors.ingredients}
              </p>
            )}
            {draft.ingredients.map((row, index) => {
              const setField = (field: 'name' | 'amount' | 'unit' | 'notes', value: string) => {
                const next = [...draft.ingredients];
                next[index] = { ...row, [field]: value };
                update('ingredients', next);
              };
              const bad = errors.ingredients ? badIngredientRows(draft.ingredients) : null;
              const flag = (field: 'name' | 'amount') =>
                bad?.field === field && bad.indexes.includes(index)
                  ? { 'aria-invalid': true as const, 'aria-describedby': 'edit-ingredients-error' }
                  : {};
              return (
                <div key={index} className="space-y-2">
                  {/* Wraps instead of squeezing: at 320px the name and remove button
                      drop to a second line rather than leaving a 68px name field. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id={`ingredient-${index}-amount`}
                      aria-label={`Ingredient ${index + 1} amount`}
                      inputMode="decimal"
                      placeholder="Amount"
                      value={row.amount}
                      onChange={(e) => setField('amount', e.target.value)}
                      {...flag('amount')}
                      className={`${pill} ${FOCUS_SCROLL} w-[76px] shrink-0 text-sm font-bold`}
                    />
                    <input
                      aria-label={`Ingredient ${index + 1} unit`}
                      placeholder="Unit"
                      value={row.unit}
                      onChange={(e) => setField('unit', e.target.value)}
                      className={`${pill} w-16 shrink-0 text-sm`}
                    />
                    <div className="flex min-w-40 flex-1 items-center gap-2">
                      <input
                        id={`ingredient-${index}-name`}
                        aria-label={`Ingredient ${index + 1} name`}
                        placeholder="Name"
                        value={row.name}
                        onChange={(e) => setField('name', e.target.value)}
                        {...flag('name')}
                        className={`${pill} ${FOCUS_SCROLL} min-w-0 flex-1 text-sm`}
                      />
                      <RemoveRowButton
                        label={`Remove ingredient ${index + 1}${row.name.trim() ? `, ${row.name.trim()}` : ''}`}
                        onClick={() =>
                          update(
                            'ingredients',
                            draft.ingredients.filter((_, i) => i !== index)
                          )
                        }
                      />
                    </div>
                  </div>
                  <input
                    aria-label={`Ingredient ${index + 1} notes`}
                    placeholder="Notes (optional)"
                    value={row.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    className={`${pill} w-full text-sm`}
                  />
                </div>
              );
            })}
            <DashedAddButton
              id="add-ingredient"
              onClick={() => update('ingredients', [...draft.ingredients, { ...EMPTY_INGREDIENT }])}
            >
              Add ingredient
            </DashedAddButton>
          </section>

          <section className="space-y-2">
            <h3 className="mt-1.5 font-heading text-xl text-text-primary">Instructions</h3>
            {errors.instructions && (
              <p id="edit-instructions-error" role="alert" className="text-sm text-danger-700">
                {errors.instructions}
              </p>
            )}
            {draft.instructions.map((row, index) => (
              <div key={index} className="flex items-start gap-2">
                {/* Numbers shown but not editable: they are renumbered on save,
                    so an editable one would be a field that lies. */}
                <span
                  aria-hidden="true"
                  className="mt-2.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-secondary font-heading text-sm text-text-primary tabular-nums"
                >
                  {index + 1}
                </span>
                <textarea
                  id={`step-${index}`}
                  aria-label={`Step ${index + 1}`}
                  rows={2}
                  value={row.text}
                  onChange={(e) => {
                    const next = [...draft.instructions];
                    next[index] = { ...row, text: e.target.value };
                    update('instructions', next);
                  }}
                  aria-invalid={errors.instructions ? true : undefined}
                  aria-describedby={errors.instructions ? 'edit-instructions-error' : undefined}
                  className={`${textareaClasses} ${FOCUS_SCROLL} min-w-0 flex-1`}
                />
                <RemoveRowButton
                  label={`Remove step ${index + 1}`}
                  onClick={() =>
                    update(
                      'instructions',
                      draft.instructions.filter((_, i) => i !== index)
                    )
                  }
                />
              </div>
            ))}
            <DashedAddButton
              id="add-step"
              onClick={() => update('instructions', [...draft.instructions, { ...EMPTY_INSTRUCTION }])}
            >
              Add step
            </DashedAddButton>
          </section>

          <section className="space-y-2">
            <h3 className="mt-1.5 font-heading text-xl text-text-primary">Notes</h3>
            {draft.notes.map((note, index) => (
              <div key={index} className="flex items-start gap-2">
                <textarea
                  aria-label={`Note ${index + 1}`}
                  rows={2}
                  value={note}
                  onChange={(e) => {
                    const next = [...draft.notes];
                    next[index] = e.target.value;
                    update('notes', next);
                  }}
                  className={`${textareaClasses} min-w-0 flex-1`}
                />
                <RemoveRowButton
                  label={`Remove note ${index + 1}`}
                  onClick={() =>
                    update(
                      'notes',
                      draft.notes.filter((_, i) => i !== index)
                    )
                  }
                />
              </div>
            ))}
            <DashedAddButton onClick={() => update('notes', [...draft.notes, ''])}>
              Add note
            </DashedAddButton>
          </section>

          <div className="space-y-1.5">
            <label htmlFor="tags" className="block text-sm font-medium text-text-primary">
              Tags
            </label>
            <input
              id="tags"
              value={draft.tags}
              onChange={(e) => update('tags', e.target.value)}
              placeholder="bread, baking, weekend"
              className={`${pill} w-full`}
            />
            <p className="text-xs text-text-tertiary">Separate tags with commas.</p>
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 border-t border-border bg-surface px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {saveError && (
            <p role="alert" className="text-sm text-danger-700">
              {saveError}
            </p>
          )}
          {!lineage.isLoading && lineage.children.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              {lineage.children.length === 1
                ? '1 branch below this keeps its own copy.'
                : `${lineage.children.length} branches below this keep their own copy.`}
            </p>
          )}
          <Button
            fullWidth
            className="min-h-[52px]"
            onClick={handleSave}
            disabled={isSaving || !isDirty || saveError === GONE_MESSAGE}
          >
            {isSaving ? 'Saving…' : isDirty ? 'Save changes' : 'No Changes'}
          </Button>
        </div>
      </footer>

      <ConfirmDialog
        open={showDiscard}
        title="Discard changes?"
        message="Your edits to this recipe haven't been saved and will be lost."
        confirmLabel="Discard"
        confirmVariant="danger"
        onConfirm={() => {
          setShowDiscard(false);
          leave(`/recipe/${id}`);
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
