import type { Recipe } from '../../types/recipe';
import { MetadataPills } from './MetadataPills';
import { IngredientList } from './IngredientList';
import { InstructionList } from './InstructionList';

interface RecipeContentProps {
  recipe: Recipe;
  compact?: boolean;
}

export function RecipeContent({ recipe, compact = false }: RecipeContentProps) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start gap-3">
          <span className={compact ? 'text-2xl' : 'text-4xl'}>{recipe.emoji}</span>
          <div>
            <h2 className={compact ? 'text-lg font-semibold' : 'text-xl font-bold'}>
              {recipe.title}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{recipe.description}</p>
          </div>
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
        <div className="space-y-2">
          <h3 className="font-semibold text-text-primary">Notes</h3>
          <ul className="space-y-1">
            {recipe.notes.map((note, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-secondary">
                <span className="text-primary-500">💡</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
