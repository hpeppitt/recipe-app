/** Recipes read per page on a shared cookbook (RL-258); one read each, so never all 200 at once. */
export const COOKBOOK_PAGE_SIZE = 20;

/** The 12px line under a cookbook card: "<prompt> branch" for a branch, "Original" for a root. */
export function cookbookTileMeta(recipe: { parentId?: string | null; prompt?: string | null }): string {
  const prompt = recipe.prompt?.trim();
  return recipe.parentId && prompt ? `${prompt} branch` : recipe.parentId ? 'Branch' : 'Original';
}
