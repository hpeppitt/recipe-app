import type { Recipe } from '../types/recipe';

/**
 * Most other cooks' direct children a version may have and still be deleted in
 * one cloud batch (RL-158). Each moved child is read by the rules, and a batch
 * may access 20 documents; the emulator passed 18 and denied 19. Held at 8
 * until RL-160 re-probes production, which may bill get and getAfter
 * separately; then raise it to the measured max minus one. Rules parity:
 * re-probe after changing isReparentAfterParentDelete() or isMovedNotice().
 */
export const MAX_MOVED_CHILDREN = 8;

export interface TreeNode {
  recipe: Recipe;
  children: TreeNode[];
}

/**
 * The given id plus every descendant of it, from a flat node list.
 *
 * Shared by the local and cloud delete cascades so both remove exactly the same
 * subtree. Nodes whose parent is missing from the list are simply unreachable
 * rather than an error, which keeps a partially-synced cloud tree safe to pass in.
 */
export function collectSubtreeIds(
  nodes: Array<{ id: string; parentId: string | null }>,
  id: string
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenByParent.set(node.parentId, siblings);
  }

  const collected = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      // Guards against a cycle in malformed data looping forever.
      if (collected.has(child)) continue;
      collected.add(child);
      queue.push(child);
    }
  }

  return [...collected];
}

export function buildTree(recipes: Recipe[]): TreeNode | null {
  if (recipes.length === 0) return null;

  const root = recipes.find((r) => r.parentId === null);
  if (!root) return null;

  // A recipe whose parent is missing from the list hangs off the root, as the timeline
  // treats it as a root (RL-159), so it is never silently dropped from the map.
  const ids = new Set(recipes.map((r) => r.id));
  const byParent = new Map<string, Recipe[]>();
  for (const recipe of recipes) {
    if (recipe.parentId && recipe !== root) {
      const parentId = ids.has(recipe.parentId) && recipe.parentId !== recipe.id ? recipe.parentId : root.id;
      const siblings = byParent.get(parentId) ?? [];
      siblings.push(recipe);
      byParent.set(parentId, siblings);
    }
  }

  function buildNode(recipe: Recipe): TreeNode {
    const children = (byParent.get(recipe.id) ?? [])
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(buildNode);
    return { recipe, children };
  }

  return buildNode(root);
}

/**
 * Descendant count per root, across a mixed set of local and published records.
 *
 * The library feed merges two stores, and a recipe can appear in both. Counting
 * each list separately and adding would double-count anything saved locally and
 * also published, so this dedupes by id first. Cloud feed entries previously
 * hardcoded a count of 0, which hid variations on exactly the recipes a new
 * user browses (UX-10).
 *
 * Counts the whole subtree, not just direct children, matching how the local
 * count was derived (`rootId` match rather than `parentId`).
 */
export function countDescendantsByRoot(
  records: Array<{ id: string; rootId: string }>
): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const r of records) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    // A root is not its own descendant.
    if (r.rootId === r.id) continue;
    counts.set(r.rootId, (counts.get(r.rootId) ?? 0) + 1);
  }

  return counts;
}

/**
 * Ancestors of `id`, root first, excluding `id` itself. Stops at a missing
 * parent, and the seen-set stops a corrupted parentId cycle from spinning.
 */
export function ancestorChain(recipes: Recipe[], id: string): Recipe[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const chain: Recipe[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id);
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/** "{N} versions, {M} cooks, started by {name} in {Month}" for one family. */
export function familySubtitle(recipes: Recipe[], now: Date = new Date()): string {
  const root = recipes.find((r) => r.parentId === null);
  const versions = recipes.length;
  const cooks = new Set(recipes.map((r) => r.createdBy.uid)).size;
  let text = `${versions} ${versions === 1 ? 'version' : 'versions'}, ${cooks} ${cooks === 1 ? 'cook' : 'cooks'}`;
  const name = root?.createdBy.displayName;
  const created = root?.createdAt ?? 0;
  // A createdAt of 0 means a cloud record without one (see toRecipeLike).
  const when = created
    ? new Date(created).toLocaleDateString(undefined, {
        month: 'long',
        ...(new Date(created).getFullYear() !== now.getFullYear() && { year: 'numeric' }),
      })
    : '';
  if (name || when) text += ', started';
  if (name) text += ` by ${name}`;
  if (when) text += ` in ${when}`;
  return text;
}
