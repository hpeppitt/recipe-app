import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Recipe } from '../types/recipe';
import { useRecipe } from '../hooks/useRecipe';
import { useAuth } from '../contexts/AuthContext';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { updateRecipe } from '../db/recipes';
import { getPublishedRecipe, publishRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { canManageRecipe } from '../lib/ownership';
import { trackRecipeUpdated } from '../services/analytics';
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
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SegmentedControl } from '../components/ui/SegmentedControl';

const DIFFICULTIES = [
  { value: 'easy' as const, label: 'Easy' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'hard' as const, label: 'Hard' },
];

/**
 * The Input primitive's own styling, minus its width and its label/error wrapper.
 *
 * Width is deliberately absent: it is set per field below. Baking `w-full` in here
 * silently defeated `w-16` and `w-20` on the ingredient row — Tailwind resolves by
 * stylesheet order, not by order within the class string, so the narrow widths lost
 * and the ingredient name field was pushed out of view entirely.
 */
const fieldBase =
  'px-3 py-2.5 rounded-xl border border-border bg-surface text-text-primary ' +
  'placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 ' +
  'focus:border-transparent transition-shadow';

const textareaClasses = `${fieldBase} w-full`;

/** A 44px-target remove button for repeatable rows. */
function RemoveRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-surface-tertiary hover:text-danger-600 transition-colors"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
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
  const { recipe, source, isLoading } = useRecipe(id);

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
        <TopBar title="Not found" showBack />
        <div className="p-8 text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="text-text-secondary">Recipe not found.</p>
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
  const id = recipe.id;

  const [draft, setDraft] = useState<RecipeDraft>(() => recipeToDraft(recipe));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

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
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    const patch = draftToPatch(draft, recipe);

    try {
      // Local first, and it is authoritative: the user's own device should hold
      // the edit even if the network is gone.
      await updateRecipe(recipe.id, patch);
    } catch (err) {
      console.error('Saving the recipe edit locally failed', err);
      setSaveError("Couldn't save your changes. Please try again.");
      setIsSaving(false);
      return;
    }

    // Re-publish only if a published copy already exists. publishRecipe would
    // otherwise take its create path and publish a recipe the user never chose to
    // share — editing is not a decision to publish. The update path uses
    // `{ merge: true }`, so favoriteCount and viewCount survive.
    let cloudOk = true;
    if (isFirebaseConfigured) {
      try {
        if (await getPublishedRecipe(recipe.id)) {
          await publishRecipe({ ...recipe, ...patch });
        }
      } catch (err) {
        console.error('Re-publishing the edited recipe failed', err);
        cloudOk = false;
      }
    }

    trackRecipeUpdated(recipe.id);
    // Reuses the detail page's existing save toast, including its honest
    // local-only variant, rather than inventing a second confirmation pattern.
    navigate(`/recipe/${recipe.id}`, {
      replace: true,
      state: { saved: cloudOk ? 'cloud' : 'local' },
    });
  };

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar title="Edit Recipe" showBack onBack={handleBack} />

      <main className="flex-1 max-w-lg mx-auto w-full">
        {/* No <form>: an implicit submit from any of the many text inputs would
            save a half-edited recipe. Saving is the explicit button below. */}
        <div className="p-4 space-y-6">
          <div className="space-y-3">
            <div className="flex gap-2 items-end">
              <div className="w-20 shrink-0">
                <Input
                  label="Emoji"
                  value={draft.emoji}
                  onChange={(e) => update('emoji', e.target.value)}
                  className="text-center text-xl"
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Title"
                  value={draft.title}
                  onChange={(e) => update('title', e.target.value)}
                  error={errors.title}
                />
              </div>
            </div>

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
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              label="Servings"
              inputMode="numeric"
              value={draft.servings}
              onChange={(e) => update('servings', e.target.value)}
              error={errors.servings}
            />
            <Input
              label="Prep (min)"
              inputMode="numeric"
              value={draft.prepTime}
              onChange={(e) => update('prepTime', e.target.value)}
              error={errors.prepTime}
            />
            <Input
              label="Cook (min)"
              inputMode="numeric"
              value={draft.cookTime}
              onChange={(e) => update('cookTime', e.target.value)}
              error={errors.cookTime}
            />
          </div>
          {/* Total is derived, so it is stated rather than editable: three
              independently editable time fields can disagree with each other. */}
          <p className="text-xs text-text-tertiary -mt-4">
            Total time is prep plus cook, worked out for you.
          </p>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-text-primary">Difficulty</span>
            <SegmentedControl
              label="Difficulty"
              options={DIFFICULTIES}
              value={draft.difficulty}
              onChange={(value) => update('difficulty', value)}
            />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">Ingredients</h2>
            {errors.ingredients && (
              <p role="alert" className="text-sm text-danger-500">
                {errors.ingredients}
              </p>
            )}
            {draft.ingredients.map((row, index) => (
              <div key={index} className="flex gap-2 items-start">
                {/* Name first and full width, amount/unit/notes beneath. Three
                    fields abreast is unusable at 390px, which is the viewport this
                    app is designed for. */}
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    aria-label={`Ingredient ${index + 1} name`}
                    placeholder="flour"
                    value={row.name}
                    onChange={(e) => {
                      const next = [...draft.ingredients];
                      next[index] = { ...row, name: e.target.value };
                      update('ingredients', next);
                    }}
                    className={`${fieldBase} w-full`}
                  />
                  <div className="flex gap-2">
                    <input
                      aria-label={`Ingredient ${index + 1} amount`}
                      inputMode="decimal"
                      placeholder="2"
                      value={row.amount}
                      onChange={(e) => {
                        const next = [...draft.ingredients];
                        next[index] = { ...row, amount: e.target.value };
                        update('ingredients', next);
                      }}
                      className={`${fieldBase} w-16 shrink-0 text-sm`}
                    />
                    <input
                      aria-label={`Ingredient ${index + 1} unit`}
                      placeholder="cups"
                      value={row.unit}
                      onChange={(e) => {
                        const next = [...draft.ingredients];
                        next[index] = { ...row, unit: e.target.value };
                        update('ingredients', next);
                      }}
                      className={`${fieldBase} w-20 shrink-0 text-sm`}
                    />
                    <input
                      aria-label={`Ingredient ${index + 1} notes`}
                      placeholder="notes, e.g. sifted"
                      value={row.notes}
                      onChange={(e) => {
                        const next = [...draft.ingredients];
                        next[index] = { ...row, notes: e.target.value };
                        update('ingredients', next);
                      }}
                      className={`${fieldBase} flex-1 min-w-0 text-sm`}
                    />
                  </div>
                </div>
                <RemoveRowButton
                  label={`Remove ingredient ${index + 1}`}
                  onClick={() =>
                    update(
                      'ingredients',
                      draft.ingredients.filter((_, i) => i !== index)
                    )
                  }
                />
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                update('ingredients', [...draft.ingredients, { ...EMPTY_INGREDIENT }])
              }
            >
              Add ingredient
            </Button>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">Instructions</h2>
            {errors.instructions && (
              <p role="alert" className="text-sm text-danger-500">
                {errors.instructions}
              </p>
            )}
            {draft.instructions.map((row, index) => (
              <div key={index} className="flex gap-2 items-start">
                {/* Numbers shown but not editable: they are renumbered on save,
                    so an editable one would be a field that lies. */}
                <span className="w-6 shrink-0 pt-3 text-sm text-text-tertiary tabular-nums">
                  {index + 1}.
                </span>
                <textarea
                  aria-label={`Step ${index + 1}`}
                  rows={2}
                  value={row.text}
                  onChange={(e) => {
                    const next = [...draft.instructions];
                    next[index] = { ...row, text: e.target.value };
                    update('instructions', next);
                  }}
                  className={`${textareaClasses} flex-1`}
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                update('instructions', [...draft.instructions, { ...EMPTY_INSTRUCTION }])
              }
            >
              Add step
            </Button>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-text-primary">Notes</h2>
            {draft.notes.map((note, index) => (
              <div key={index} className="flex gap-2 items-start">
                <textarea
                  aria-label={`Note ${index + 1}`}
                  rows={2}
                  value={note}
                  onChange={(e) => {
                    const next = [...draft.notes];
                    next[index] = e.target.value;
                    update('notes', next);
                  }}
                  className={`${textareaClasses} flex-1`}
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => update('notes', [...draft.notes, ''])}
            >
              Add note
            </Button>
          </section>

          <Input
            label="Tags"
            value={draft.tags}
            onChange={(e) => update('tags', e.target.value)}
            placeholder="bread, baking, weekend"
          />
          <p className="text-xs text-text-tertiary -mt-4">Separate tags with commas.</p>
        </div>
      </main>

      <div className="p-4 border-t border-border">
        <div className="max-w-lg mx-auto space-y-2">
          {saveError && (
            <p role="alert" className="text-sm text-danger-600">
              {saveError}
            </p>
          )}
          <Button fullWidth onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? 'Saving…' : isDirty ? 'Save Changes' : 'No Changes'}
          </Button>
          <Button variant="ghost" fullWidth onClick={handleBack} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>

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
