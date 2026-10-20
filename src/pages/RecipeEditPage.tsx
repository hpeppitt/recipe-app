import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
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
import { formatTime, withTimeout } from '../lib/utils';
import {
  recipeToDraft,
  validateDraft,
  draftToPatch,
  isDraftDirty,
  EMPTY_INGREDIENT,
  EMPTY_INSTRUCTION,
  moveItem,
  type RecipeDraft,
  type DraftErrors,
} from '../lib/recipeEdit';
import { TopBar } from '../components/layout/TopBar';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ChevronDown, Clock, Gauge, GitBranch, GripVertical, Pencil, Plus, UserRound, X } from '../components/ui/icons';

/** How long a verified owner's save waits for the cloud check and publish. */
const CLOUD_SAVE_TIMEOUT_MS = 5000;

/** Shown when the cloud copy is gone; there is nothing to retry against. */
const GONE_MESSAGE = 'This recipe is no longer in your account.';

const DIFFICULTIES = [
  { value: 'easy' as const, label: 'Easy' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'hard' as const, label: 'Hard' },
];

const SERVINGS_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i === 0 ? 'serving' : 'servings'}`,
}));
// A stored minutes value that is not a whole non-negative number shows raw, not "NaN min".
const minutesLabel = (prefix: string, v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? `${prefix} ${formatTime(n)}` : `${prefix} ${v}`;
};
const MINUTES = [...Array.from({ length: 13 }, (_, i) => i * 5), 75, 90, 105, 120, 150, 180, 210, 240];
const timeOptions = (prefix: string) => MINUTES.map((m) => ({ value: String(m), label: `${prefix} ${formatTime(m)}` }));
const PREP_OPTIONS = timeOptions('Prep');
const COOK_OPTIONS = timeOptions('Cook');

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

/**
 * A pill that is a native select: icon, value, chevron. The option list is fixed;
 * a current value that is not on it is added so opening and saving never loses it.
 */
function PickPill({
  id,
  label,
  icon,
  value,
  options,
  extraLabel,
  onChange,
  error,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  extraLabel?: (value: string) => string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const shown = options.some((o) => o.value === value) ? options : [...options, { value, label: value ? (extraLabel?.(value) ?? value) : 'Not set' }];
  return (
    <div className="min-w-0">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">{icon}</span>
        <select
          id={id}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-h-11 appearance-none rounded-full bg-neutral-100 py-1.5 pl-9 pr-8 text-[13px] font-bold text-text-primary ring-inset focus:outline-none focus-visible:ring-[3px] ${FOCUS_SCROLL} ${error ? 'ring-[1.5px] ring-danger-500 focus-visible:ring-danger-500' : 'ring-[1.5px] ring-neutral-400 focus-visible:ring-primary-500'}`}
        >
          {shown.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 max-w-[220px] px-3 text-sm text-danger-700">
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
  // Draft-only row keys, kept beside the draft so isDraftDirty and draftToPatch never see them.
  const nextKey = useRef(recipe.ingredients.length);
  const [ingKeys, setIngKeys] = useState<number[]>(() => recipe.ingredients.map((_, i) => i));
  const [methodOpen, setMethodOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const ingListRef = useRef<HTMLDivElement>(null);
  const focusGrip = useRef<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const moveInFlight = useRef(false);
  const ingCount = useRef(recipe.ingredients.length);
  const [dragKey, setDragKey] = useState<number | null>(null);
  // Direct children only. While the tree loads nothing is shown, never a wrong count.
  const lineage = useRecipeLineage(recipe);

  const isDirty = isDraftDirty(draft, recipe) && !isSaving;
  const { leave } = useUnsavedGuard(isDirty, () => setShowDiscard(true));

  const update = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const moveIngredient = (from: number, to: number) => {
    // Functional updaters so rows and keys always move together, on the latest state.
    if (moveInFlight.current || from === to || to < 0 || to >= ingCount.current) return false;
    moveInFlight.current = true;
    setIngKeys((k) => moveItem(k, from, to));
    setDraft((d) => ({ ...d, ingredients: moveItem(d.ingredients, from, to) }));
    return true;
  };

  // A row moved by keyboard keeps focus on its handle (the same DOM node, new index).
  useLayoutEffect(() => {
    // A new render means the DOM matches the draft again, so the next drag step may measure it.
    moveInFlight.current = false;
    ingCount.current = draft.ingredients.length;
    if (focusGrip.current === null) return;
    document.getElementById(`ingredient-${focusGrip.current}-grip`)?.focus();
    focusGrip.current = null;
  });

  const onGripKey = (e: KeyboardEvent, index: number) => {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
    if (to === null) return;
    e.preventDefault();
    const name = draft.ingredients[index].name.trim() || `Ingredient ${index + 1}`;
    const total = draft.ingredients.length;
    // The trailing nbsp alternates so a repeated message is still announced.
    const say = (text: string) => setAnnouncement((a) => (a.endsWith('\u00a0') ? text : `${text}\u00a0`));
    if (moveIngredient(index, to)) {
      focusGrip.current = to;
      say(`${name} moved to position ${to + 1} of ${total}`);
    } else {
      say(`${name} is already ${to < 0 ? 'first' : 'last'}`);
    }
  };

  const endDrag = () => {
    dragFrom.current = null;
    setDragKey(null);
  };

  const onGripPointerMove = (e: PointerEvent) => {
    const from = dragFrom.current;
    if (from === null) return;
    const rows = ingListRef.current?.querySelectorAll('[data-ing-row]');
    const mid = (i: number) => {
      const r = rows?.[i]?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : null;
    };
    // Keep the dragged row's neighbours reachable by touch: scroll near the sticky header and footer.
    if (e.clientY < 80) window.scrollBy?.(0, -12);
    else if (e.clientY > window.innerHeight - 80) window.scrollBy?.(0, 12);
    const HYSTERESIS = 6; // px past the midpoint, so a row does not flicker at the boundary
    const above = from > 0 ? mid(from - 1) : null;
    const below = mid(from + 1);
    const to =
      above !== null && e.clientY < above - HYSTERESIS
        ? from - 1
        : below !== null && e.clientY > below + HYSTERESIS
          ? from + 1
          : from;
    if (to !== from && moveIngredient(from, to)) dragFrom.current = to;
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
      // The error must not stay hidden: open the method, committed before the focus below.
      if (found.instructions) flushSync(() => setMethodOpen(true));
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
            <PickPill id="edit-servings" label="Servings" icon={<UserRound className="h-4 w-4" />} value={draft.servings} options={SERVINGS_OPTIONS} extraLabel={(v) => `${v} servings`} onChange={(v) => update('servings', v)} error={errors.servings} />
            <PickPill id="edit-prep" label="Prep" icon={<Clock className="h-4 w-4" />} value={draft.prepTime} options={PREP_OPTIONS} extraLabel={(v) => minutesLabel('Prep', v)} onChange={(v) => update('prepTime', v)} error={errors.prepTime} />
            <PickPill id="edit-cook" label="Cook" icon={<Clock className="h-4 w-4" />} value={draft.cookTime} options={COOK_OPTIONS} extraLabel={(v) => minutesLabel('Cook', v)} onChange={(v) => update('cookTime', v)} error={errors.cookTime} />
            <PickPill id="edit-difficulty" label="Difficulty" icon={<Gauge className="h-4 w-4" />} value={draft.difficulty} options={DIFFICULTIES} onChange={(v) => update('difficulty', v as Recipe['difficulty'])} />
          </div>
          {/* Total is derived, so it is stated rather than editable: three
              independently editable time fields can disagree with each other. */}
          <p className="-mt-2 text-xs text-text-tertiary">
            Total time is prep plus cook, worked out for you.
          </p>

          <section className="space-y-2">
            <h3 className="mt-1.5 font-heading text-xl text-text-primary">Ingredients</h3>
            {errors.ingredients && (
              <p id="edit-ingredients-error" role="alert" className="text-sm text-danger-700">
                {errors.ingredients}
              </p>
            )}
            <p id="ingredient-move-hint" className="sr-only">Use the up and down arrow keys to move</p>
            <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
            <div ref={ingListRef} className="space-y-2">
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
                <div key={ingKeys[index]} data-ing-row className={`space-y-2 ${dragKey === ingKeys[index] ? 'rounded-2xl bg-surface-secondary shadow-md' : ''}`}>
                  {/* Wraps instead of squeezing: at 320px the name and remove button
                      drop to a second line rather than leaving a 68px name field. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      id={`ingredient-${index}-grip`}
                      aria-label={`Move ingredient ${index + 1}, ${row.name.trim() || 'unnamed'}`}
                      aria-describedby="ingredient-move-hint"
                      onKeyDown={(e) => onGripKey(e, index)}
                      aria-roledescription="reorder handle"
                      onPointerDown={(e) => {
                        if (!e.isPrimary || e.button !== 0) return;
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        dragFrom.current = index;
                        setDragKey(ingKeys[index]);
                      }}
                      onPointerMove={onGripPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      style={{ touchAction: 'none' }}
                      className={`${FOCUS_SCROLL} -mx-2 flex h-11 w-11 shrink-0 cursor-grab select-none items-center justify-center text-neutral-500 rounded-full focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-500`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
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
                        onClick={() => {
                          setIngKeys((k) => k.filter((_, i) => i !== index));
                          update(
                            'ingredients',
                            draft.ingredients.filter((_, i) => i !== index)
                          );
                        }}
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
            </div>
            <DashedAddButton
              id="add-ingredient"
              onClick={() => {
                setIngKeys((k) => [...k, nextKey.current++]);
                update('ingredients', [...draft.ingredients, { ...EMPTY_INGREDIENT }]);
              }}
            >
              Add ingredient
            </DashedAddButton>
          </section>

          <section className="space-y-2">
            <h3 className="mt-1.5 font-heading text-xl text-text-primary">
              <button
                type="button"
                aria-expanded={methodOpen}
                aria-controls="edit-method"
                onClick={() => setMethodOpen((o) => !o)}
                className="flex min-h-11 w-full items-center justify-between text-left"
              >
                Method
                <span className="flex items-center gap-1 font-sans text-[13px] font-normal text-neutral-700">
                  {draft.instructions.length} {draft.instructions.length === 1 ? 'step' : 'steps'}
                  <ChevronDown className={`h-4 w-4 transition-transform ${methodOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
            </h3>
            <div id="edit-method" hidden={!methodOpen} className="space-y-2">
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
            </div>
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
