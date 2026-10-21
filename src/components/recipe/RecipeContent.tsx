import { useState, useMemo, type ReactNode } from 'react';
import type { Recipe } from '../../types/recipe';
import { MetadataPills } from './MetadataPills';
import { IngredientList } from './IngredientList';
import { InstructionList } from './InstructionList';
import { NutritionPanel } from './NutritionPanel';
import { TagList } from './TagList';
import { ServingStepper, ScaledStrip } from './ServingStepper';
import { scaleRecipe } from '../../lib/scale';

interface RecipeContentProps {
  recipe: Recipe;
  compact?: boolean;
  /** Omit the emoji, title and description; the recipe page renders them in RecipeHeader. */
  hideHeader?: boolean;
  /** Rendered between the metadata pills and the ingredients (RL-163). */
  afterMeta?: ReactNode;
  /** Ticking the last method step (RL-198). */
  onAllTicked?: (allDone: boolean) => void;
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

function RecipeContentBody({ recipe, compact = false, hideHeader = false, afterMeta, onAllTicked }: RecipeContentProps) {
  // Display-only, and deliberately not persisted: cooking for eight tonight says
  // nothing about next time, and a recipe that silently remembered a scale would
  // eventually mislead.
  const [servings, setServings] = useState(recipe.servings);
  // Cloud documents are not validated on read, so either array can be absent.
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : null;
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : null;
  const notes = Array.isArray(recipe.notes) ? recipe.notes : [];
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  const scaled = useMemo(
    () => scaleRecipe({ ...recipe, ingredients: ingredients ?? [] }, servings),
    [recipe, ingredients, servings]
  );

  return (
    <div className="space-y-5">
      {!hideHeader && (
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
        )}

      <MetadataPills
        prepTime={recipe.prepTime}
        cookTime={recipe.cookTime}
        totalTime={recipe.totalTime}
        difficulty={recipe.difficulty}
        author={compact ? null : recipe.createdBy}
        nutrition={recipe.nutrition}
        tags={recipe.tags}
        servings={compact ? scaled.servings : undefined}
      />

      {afterMeta}

      {/* The stepper sits in the Ingredients heading row, because ingredient
          amounts are the only thing it changes. Hidden in the compact preview,
          where the recipe is a proposal rather than something being cooked from;
          ticks are likewise full-view only. */}
      {/* Side by side only at lg in a column of 36rem or more (the recipe page's @container, RL-116). */}
      <div className={compact ? 'space-y-5' : 'space-y-5 lg:@xl:grid lg:@xl:grid-cols-[1fr_1.4fr] lg:@xl:gap-9 lg:@xl:space-y-0 [&>*]:min-w-0'}>
      {ingredients ? (
        <IngredientList
          ingredients={scaled.ingredients}
          checkable={!compact}
          scaled={servings !== recipe.servings && recipe.servings > 0}
          headingAside={!compact && <ServingStepper servings={scaled.servings} onChange={setServings} />}
          belowHeading={
            !compact && (
              <ScaledStrip
                servings={scaled.servings}
                original={recipe.servings}
                onReset={() => setServings(recipe.servings)}
              />
            )
          }
        />
      ) : (
        <MissingSection name="ingredients" />
      )}
      {instructions ? (
        <InstructionList instructions={instructions} checkable={!compact} onAllTicked={onAllTicked} />
      ) : (
        <MissingSection name="instructions" />
      )}
      </div>

      {/* Nutrition is per serving, so scaling leaves the figures alone. Renders
          nothing without estimates, and stays collapsed (keyed per recipe). */}
      {!compact && <NutritionPanel nutrition={recipe.nutrition} />}

      {notes.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-text-primary">Notes</h3>
          <ul className="space-y-1">
            {notes.map((note, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-secondary">
                <span className="text-primary-500">💡</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && <TagList tags={tags} />}
    </div>
  );
}

function MissingSection({ name }: { name: string }) {
  return (
    <p role="status" className="text-sm text-text-secondary bg-surface-secondary rounded-xl p-3">
      This recipe has no {name} to show.
    </p>
  );
}
