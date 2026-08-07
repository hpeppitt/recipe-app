/**
 * Which one-time explainers a user has already seen.
 *
 * The branching tree is the product's whole identity and nothing in the app
 * taught it. The library welcome panel described it in prose, which the people
 * who most need it skip, and `Create Variation` sat on every recipe with no hint
 * that it produces a *new* version rather than editing this one. So a new user
 * could use the app without ever discovering the feature it is built around.
 *
 * Kept out of the component and out of `services/storage.ts` so the rules about
 * *when* to teach are testable without a DOM.
 */

/** Ids are stored, so renaming one re-shows that explainer to everyone. */
export type IntroId = 'recipe-tree';

export interface IntroState {
  /** Intro ids the user has dismissed. */
  seen: IntroId[];
  /**
   * How many separate recipes the user has opened. Used to hold the tree
   * explainer back until the second one: on the very first recipe the user is
   * still working out what the page is, and an explainer about versioning
   * something they have not yet decided they like is noise. By the second recipe
   * the concept has somewhere to land.
   */
  recipesViewed: number;
}

export const EMPTY_INTRO_STATE: IntroState = { seen: [], recipesViewed: 0 };

/** Below this many viewed recipes, the tree explainer stays out of the way. */
export const TREE_INTRO_MIN_RECIPES = 2;

/**
 * Tolerates anything: this comes from localStorage, which a user can edit and an
 * older build may have written in a different shape. A malformed value means
 * "show the intro again", which is a far better failure than throwing on load.
 */
export function parseIntroState(raw: string | null): IntroState {
  if (!raw) return EMPTY_INTRO_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<IntroState>;
    return {
      seen: Array.isArray(parsed?.seen)
        ? parsed.seen.filter((s): s is IntroId => typeof s === 'string')
        : [],
      recipesViewed:
        typeof parsed?.recipesViewed === 'number' && parsed.recipesViewed >= 0
          ? Math.floor(parsed.recipesViewed)
          : 0,
    };
  } catch {
    return EMPTY_INTRO_STATE;
  }
}

export function hasSeen(state: IntroState, id: IntroId): boolean {
  return state.seen.includes(id);
}

export function markSeen(state: IntroState, id: IntroId): IntroState {
  if (hasSeen(state, id)) return state;
  return { ...state, seen: [...state.seen, id] };
}

/** Idempotent per recipe id is the caller's job; this just counts. */
export function countRecipeViewed(state: IntroState): IntroState {
  return { ...state, recipesViewed: state.recipesViewed + 1 };
}

/**
 * Whether to show the tree explainer on a recipe page.
 *
 * Three conditions, all deliberate:
 * - not already dismissed, because being taught twice is nagging;
 * - the user has opened at least a couple of recipes, so the idea has context;
 * - the recipe is a root. On a variation the lineage breadcrumb and the parent
 *   preview are already showing the concept in the concrete, and an abstract
 *   explainer next to a live example is worse than the example alone.
 */
export function shouldShowTreeIntro(
  state: IntroState,
  recipe: { depth: number } | null | undefined
): boolean {
  if (!recipe) return false;
  if (hasSeen(state, 'recipe-tree')) return false;
  if (recipe.depth > 0) return false;
  return state.recipesViewed >= TREE_INTRO_MIN_RECIPES;
}
