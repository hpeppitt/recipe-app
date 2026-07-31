import { useState, useMemo } from 'react';
import type { Recipe } from '../../types/recipe';
import { MetadataPills } from './MetadataPills';
import { IngredientList } from './IngredientList';
import { InstructionList } from './InstructionList';
import { NutritionPanel } from './NutritionPanel';
import { TagList } from './TagList';
import { ServingStepper } from './ServingStepper';
import { scaleRecipe } from '../../lib/scale';

interface RecipeContentProps {
  recipe: Recipe;
  compact?: boolean;
}

/**
 * Keyed on the recipe id so the serving-scale state resets when the recipe
 * changes identity.
 *
 * This wrapper is not ceremony. `RecipeDetailPage` stays mounted when navigating
 * from one recipe to another — same route, different param — so without the key
 * a scale chosen on one recipe would silently carry over to the next one, showing
 * amounts for a serving count the new recipe never mentioned. Keying here rather
 * than at each call site means no caller has to remember.
 */
export function RecipeContent(props: RecipeContentProps) {
  return <RecipeContentBody key={props.recipe.id} {...props} />;
}

function RecipeContentBody({ recipe, compact = false }: RecipeContentProps) {
  // Display-only, and deliberately not persisted: cooking for eight tonight says
  // nothing about next time, and a recipe that silently remembered a scale would
  // eventually mislead.
  const [servings, setServings] = useState(recipe.servings);
  const scaled = useMemo(() => scaleRecipe(recipe, servings), [recipe, servings]);

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
        servings={scaled.servings}
        difficulty={recipe.difficulty}
      />

      {/* Above the ingredients, because that is the only thing it changes.
          Hidden in the compact preview, where the recipe is a proposal rather
          than something being cooked from. */}
      {!compact && (
        <ServingStepper
          servings={scaled.servings}
          original={recipe.servings}
          onChange={setServings}
        />
      )}

      {/* Cook-along ticks only on the full view. In the collapsed parent-recipe
          preview the recipe is context, not something being cooked. */}
      {/* Above the ingredients: someone deciding whether to cook this wants the
          macros before the shopping list, not after the method. Renders nothing
          when the recipe has no estimates. */}
      {/* Nutrition is per serving, so scaling leaves the figures alone; only the
          "of N" count it reports follows the stepper. */}
      {!compact && (
        <NutritionPanel nutrition={recipe.nutrition} servings={scaled.servings} />
      )}

      <IngredientList ingredients={scaled.ingredients} checkable={!compact} />
      <InstructionList instructions={recipe.instructions} checkable={!compact} />

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

      {!compact && <TagList tags={recipe.tags} />}
    </div>
  );
}
