import type { GeneratedRecipe } from '../../types/api';
import type { Recipe, Nutrition } from '../../types/recipe';
import { MetadataPills } from '../recipe/MetadataPills';
import { IngredientList } from '../recipe/IngredientList';
import { InstructionList } from '../recipe/InstructionList';
import { NutritionPanel } from '../recipe/NutritionPanel';
import { TagList } from '../recipe/TagList';
import { Button } from '../ui/Button';

interface RecipeCardMessageProps {
  recipe: GeneratedRecipe | Recipe;
  showSave?: boolean;
  saveLabel?: string;
  onSave?: () => void;
  saving?: boolean;
}

export function RecipeCardMessage({
  recipe,
  showSave,
  saveLabel = 'Save Recipe',
  onSave,
  saving = false,
}: RecipeCardMessageProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{recipe.emoji}</span>
        <div>
          <h3 className="font-semibold text-text-primary">{recipe.title}</h3>
          <p className="text-sm text-text-secondary mt-0.5">{recipe.description}</p>
        </div>
      </div>

      <MetadataPills
        prepTime={recipe.prepTime}
        cookTime={recipe.cookTime}
        totalTime={recipe.totalTime}
        servings={recipe.servings}
        difficulty={recipe.difficulty}
      />

      {/* Shown before saving: macros are part of deciding whether this is the
          recipe you want, so withholding them until after the save would be odd. */}
      <NutritionPanel
        nutrition={(recipe as { nutrition?: Nutrition | null }).nutrition}
        servings={recipe.servings}
      />

      <IngredientList ingredients={recipe.ingredients} />
      <InstructionList instructions={recipe.instructions} />

      {recipe.notes.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="font-semibold text-sm text-text-primary">Notes</h3>
          <ul className="space-y-1">
            {recipe.notes.map((note, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-secondary">
                <span>💡</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TagList tags={recipe.tags} />

      {showSave && onSave && (
        <Button fullWidth onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      )}
    </div>
  );
}
