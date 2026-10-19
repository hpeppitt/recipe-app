import { useId } from 'react';
import type { GeneratedRecipe } from '../../types/api';
import type { Recipe, Nutrition } from '../../types/recipe';
import { MetadataPills } from '../recipe/MetadataPills';
import { IngredientList } from '../recipe/IngredientList';
import { InstructionList } from '../recipe/InstructionList';
import { NutritionPanel } from '../recipe/NutritionPanel';
import { TagList } from '../recipe/TagList';
import { Button } from '../ui/Button';
import { EmojiBlob } from '../ui/EmojiBlob';
import { Bookmark, ChevronDown, ChevronUp } from '../ui/icons';
import { formatTime } from '../../lib/utils';

interface RecipeCardMessageProps {
  recipe: GeneratedRecipe | Recipe;
  showSave?: boolean;
  saveLabel?: string;
  onSave?: () => void;
  saving?: boolean;
  /** Full recipe shown. Defaults to true; only the chat collapses older cards. */
  expanded?: boolean;
  /** Passing this adds the toggle and the "Read full recipe" button. */
  onToggle?: () => void;
}

const PREVIEW_INGREDIENTS = 8;

export function RecipeCardMessage({
  recipe,
  showSave,
  saveLabel = 'Save Recipe',
  onSave,
  saving = false,
  expanded = true,
  onToggle,
}: RecipeCardMessageProps) {
  const bodyId = useId();
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const names = ingredients.map((i) => i.name).filter(Boolean);
  const meta = [
    recipe.totalTime ? formatTime(recipe.totalTime) : '',
    recipe.difficulty ?? '',
    ingredients.length > 0
      ? `${ingredients.length} ${ingredients.length === 1 ? 'ingredient' : 'ingredients'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const label = expanded ? 'Hide full recipe' : 'Show full recipe';

  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-[30px] bg-surface-secondary p-4">
      <div className="flex min-w-0 items-center gap-3">
        <EmojiBlob size={52} tint="bg-surface" emoji={recipe.emoji} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-heading text-xl leading-[1.1] text-text-primary">
            {recipe.title || 'Untitled recipe'}
          </h3>
          {meta && <p className="mt-1 text-xs text-text-tertiary">{meta}</p>}
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={bodyId}
            aria-label={label}
            // after: extends the 36px circle to a 44px hit area
            className="relative flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-surface text-text-primary after:absolute after:-inset-1 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>

      <div id={bodyId} className="flex min-w-0 flex-col gap-4">
        {expanded ? (
          <>
            <p className="break-words text-sm text-text-secondary">{recipe.description}</p>

            <MetadataPills
              prepTime={recipe.prepTime}
              cookTime={recipe.cookTime}
              totalTime={recipe.totalTime}
              servings={recipe.servings}
              difficulty={recipe.difficulty}
              nutrition={(recipe as { nutrition?: Nutrition | null }).nutrition}
            />

            <IngredientList ingredients={recipe.ingredients} />
            <InstructionList instructions={recipe.instructions} />

            {/* Shown before saving: macros are part of deciding whether this is the
                recipe you want, so withholding them until after the save would be odd. */}
            <NutritionPanel
              nutrition={(recipe as { nutrition?: Nutrition | null }).nutrition}
            />

            {recipe.notes.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="font-semibold text-sm text-text-primary">Notes</h3>
                <ul className="space-y-1">
                  {recipe.notes.map((note, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-secondary">
                      <span>💡</span>
                      <span className="min-w-0 break-words">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <TagList tags={recipe.tags} />
          </>
        ) : (
          <>
            {names.length > 0 && (
              <p className="break-words text-[13px] text-text-secondary">
                {names.slice(0, PREVIEW_INGREDIENTS).join(' · ')}
                {names.length > PREVIEW_INGREDIENTS ? '…' : ''}
              </p>
            )}
            <Button size="sm" variant="secondary" className="bg-surface" onClick={onToggle}>
              Read full recipe
            </Button>
          </>
        )}
      </div>

      {showSave && onSave && (
        <Button fullWidth onClick={onSave} disabled={saving} className="min-h-[46px] gap-2">
          <Bookmark className="size-[18px]" />
          {saving ? 'Saving…' : saveLabel}
        </Button>
      )}
    </div>
  );
}
