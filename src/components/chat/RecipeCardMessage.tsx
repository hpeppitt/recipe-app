import type { GeneratedRecipe } from '../../types/api';
import type { Recipe } from '../../types/recipe';
import { MetadataPills } from '../recipe/MetadataPills';
import { IngredientList } from '../recipe/IngredientList';
import { InstructionList } from '../recipe/InstructionList';
import { Button } from '../ui/Button';

interface RecipeCardMessageProps {
  recipe: GeneratedRecipe | Recipe;
  showSave?: boolean;
  saveLabel?: string;
  onSave?: () => void;
}

export function RecipeCardMessage({ recipe, showSave, saveLabel = 'Save Recipe', onSave }: RecipeCardMessageProps) {
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

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}

      {showSave && onSave && (
        <Button fullWidth onClick={onSave}>
          {saveLabel}
        </Button>
      )}
    </div>
  );
}
