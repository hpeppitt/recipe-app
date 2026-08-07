import type { Ingredient, Recipe } from '../types/recipe';

/**
 * Scaling a recipe to a different number of servings.
 *
 * A display transform, never persisted. Saving a scaled copy would be
 * duplicate-recipe pollution for what is a view concern, and it would mean the
 * same dish existed twice in the shared library at different sizes.
 *
 * Deliberately narrow about what scales:
 *
 * - **Ingredient amounts** scale. This is the whole feature.
 * - **Times do not.** Doubling a traybake does not double its roasting time, and
 *   a recipe that claimed it would be actively wrong in a way that ruins dinner.
 * - **Nutrition does not.** Those figures are already per serving, so they are
 *   invariant under scaling; scaling them would double-count.
 * - **Instruction text does not.** "Divide into 12 balls" cannot be rewritten
 *   safely by arithmetic, and a half-rewritten method is worse than one the cook
 *   adjusts themselves. This is a real limit of the feature, not an oversight.
 */

/** An amount of `null` means "to taste" and must stay that way at any scale. */
function scaleAmount(amount: number, factor: number, isCount: boolean): number {
  const raw = amount * factor;

  if (isCount) {
    // Whole things — eggs, onions, tortillas. Halves are the finest division
    // that means anything in a kitchen, and the floor stops a small factor
    // producing "0 eggs", which reads as "omit this ingredient".
    const halves = Math.round(raw * 2) / 2;
    return Math.max(0.5, halves);
  }

  // Measured amounts. Precision tracks magnitude: nobody measures 237.5 g, and
  // rounding 0.75 tsp to the nearest whole would destroy it.
  if (raw >= 100) return Math.round(raw / 5) * 5;
  if (raw >= 20) return Math.round(raw);
  if (raw >= 1) return Math.round(raw * 4) / 4;
  // Below 1, snap to the fractions the renderer can actually draw (¼ ⅓ ½ ⅔ ¾)
  // rather than emitting 0.4166.
  const KITCHEN_FRACTIONS = [0.25, 0.33, 0.5, 0.67, 0.75, 1];
  const nearest = KITCHEN_FRACTIONS.reduce((best, f) =>
    Math.abs(f - raw) < Math.abs(best - raw) ? f : best
  );
  // An eighth is the smallest thing a measuring spoon set expresses; below that,
  // pinches are the honest answer and we keep the arithmetic rather than lie.
  return raw < 0.125 ? Math.round(raw * 100) / 100 : nearest;
}

export function scaleIngredients(ingredients: Ingredient[], factor: number): Ingredient[] {
  if (factor === 1) return ingredients;
  return ingredients.map((ing) => {
    if (ing.amount === null) return ing;
    // No unit means a count of the thing itself: "2 eggs", "1 onion".
    const isCount = ing.unit === null;
    return { ...ing, amount: scaleAmount(ing.amount, factor, isCount) };
  });
}

/**
 * The factor needed to take a recipe from its own servings to `targetServings`.
 *
 * Guards a stored `servings` of 0 or a missing value, which would otherwise
 * produce Infinity and render every amount as "Infinity g".
 */
export function scaleFactor(fromServings: number, targetServings: number): number {
  if (!fromServings || fromServings <= 0) return 1;
  return targetServings / fromServings;
}

/**
 * A scaled view of a recipe. Same object shape so every component that renders a
 * recipe keeps working, but only `servings` and ingredient amounts differ.
 */
export function scaleRecipe(recipe: Recipe, targetServings: number): Recipe {
  const factor = scaleFactor(recipe.servings, targetServings);
  if (factor === 1) return recipe;
  return {
    ...recipe,
    servings: targetServings,
    ingredients: scaleIngredients(recipe.ingredients, factor),
  };
}
