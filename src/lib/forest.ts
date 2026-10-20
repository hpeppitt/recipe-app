import type { Recipe } from '../types/recipe';
import { buildTree, type TreeNode } from './tree';

export interface ForestDot {
  id: string;
  x: number;
  y: number;
  r: number;
  mine: boolean;
}

export interface ForestFamily {
  dots: ForestDot[];
  path: string;
  planted: boolean;
  grewCount: number;
  target: string;
}

const WIDTH_SPAN = 112;
const HEIGHT = 74;
const MAX_DRAWN = 40;

const round = (n: number) => Math.round(n * 10) / 10;

/** The family's root, or undefined when the list has none. */
const rootOf = (recipes: Recipe[]) => recipes.find((r) => r.parentId === null);

/**
 * Geometry for one family's 140x74 drawing (4b Forest view). Depth comes from the
 * parent chain via buildTree, not the stored `depth`.
 * shortcut: only the first 40 versions by createdAt are drawn (the root is always kept),
 * counts still use the whole family; revisit if a family's drawing needs to show more.
 */
export function layoutForestFamily(recipes: Recipe[], personUid: string): ForestFamily {
  const root = rootOf(recipes);
  const planted = root?.createdBy.uid === personUid;
  const mineAll = recipes.filter((r) => r.createdBy.uid === personUid).sort((a, b) => a.createdAt - b.createdAt);
  const grewCount = mineAll.filter((r) => r !== root).length;
  const target = planted ? root!.id : (mineAll[0]?.id ?? '');

  const drawn = [...recipes].sort((a, b) => a.createdAt - b.createdAt).slice(0, MAX_DRAWN);
  if (root && !drawn.includes(root)) drawn[drawn.length - 1] = root;
  const tree = buildTree(drawn);
  if (!tree) return { dots: [], path: '', planted, grewCount, target };

  const levels: TreeNode[][] = [];
  const parentOf = new Map<string, TreeNode>();
  let level = [tree];
  while (level.length > 0) {
    levels.push(level);
    const next: TreeNode[] = [];
    for (const node of level) {
      for (const child of node.children) {
        parentOf.set(child.recipe.id, node);
        next.push(child);
      }
    }
    level = next;
  }

  const maxDepth = levels.length - 1;
  const pos = new Map<string, { x: number; y: number }>();
  const dots: ForestDot[] = [];
  levels.forEach((nodes, depth) => {
    nodes.forEach((node, j) => {
      const x = round(maxDepth === 0 ? 70 : 14 + (depth * WIDTH_SPAN) / maxDepth);
      const y = round(((j + 1) * HEIGHT) / (nodes.length + 1));
      pos.set(node.recipe.id, { x, y });
      dots.push({ id: node.recipe.id, x, y, r: depth === 0 ? 7 : 5, mine: node.recipe.createdBy.uid === personUid });
    });
  });

  const path = dots
    .filter((d) => parentOf.has(d.id))
    .map((d) => {
      const a = pos.get(parentOf.get(d.id)!.recipe.id)!;
      return `M${a.x} ${a.y} C${a.x + 18} ${a.y} ${d.x - 18} ${d.y} ${d.x} ${d.y}`;
    })
    .join(' ');

  return { dots, path, planted, grewCount, target };
}

/** Planted = families rooted by the person; grown = branches by anyone under those roots. */
export function forestSummary(families: Recipe[][], personUid: string): { planted: number; grown: number } {
  let planted = 0;
  let grown = 0;
  for (const family of families) {
    if (rootOf(family)?.createdBy.uid !== personUid) continue;
    planted += 1;
    grown += family.filter((r) => r.parentId !== null).length;
  }
  return { planted, grown };
}

export function forestHeadline(planted: number, grown: number): string {
  const recipes = planted === 1 ? '1 recipe' : `${planted} recipes`;
  const branches = grown === 1 ? '1 branch has' : `${grown} branches have`;
  return `Planted ${recipes}. ${branches} grown from ${planted === 1 ? 'it' : 'them'}.`;
}
