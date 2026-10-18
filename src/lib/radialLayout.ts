import type { TreeNode } from './tree';

export interface RadialNode {
  id: string;
  x: number;
  y: number;
  generation: number;
  angle: number;
}

export interface RadialLayout {
  nodes: RadialNode[];
  edges: Array<{ from: string; to: string }>;
  rings: number[];
  size: number;
}

export interface RadialOptions {
  ringGap?: number;
  padding?: number;
}

/**
 * Radial layout of a version family. The root sits at the centre; generation g sits on
 * the ring of radius g * ringGap. Children split their parent's angular span in
 * proportion to subtree size, in child order, starting at the top (-PI/2) clockwise.
 * Coordinates are relative to the centre (size / 2, size / 2).
 *
 * Walks are iterative so a very deep chain cannot overflow the stack. A node whose id
 * was already placed is skipped with its subtree, so duplicate ids cannot loop or
 * collide. Output order is breadth-first, so it is deterministic.
 *
 * Angular crowding on a large ring is deliberately not handled here: proportional spans
 * only. The view's large-family fallback (RL-072) deals with it.
 */
export function layoutRadial(tree: TreeNode, options: RadialOptions = {}): RadialLayout {
  const ringGap = options.ringGap ?? 72;
  const padding = options.padding ?? 40;

  // Breadth-first walk, children kept in order, duplicates dropped.
  const seen = new Set<string>([tree.recipe.id]);
  const order: Array<{ node: TreeNode; parent: number; generation: number }> = [
    { node: tree, parent: -1, generation: 0 },
  ];
  for (let i = 0; i < order.length; i++) {
    const { node, generation } = order[i];
    for (const child of node.children ?? []) {
      if (seen.has(child.recipe.id)) continue;
      seen.add(child.recipe.id);
      order.push({ node: child, parent: i, generation: generation + 1 });
    }
  }

  // Parents precede children in `order`, so a reverse pass accumulates subtree sizes.
  const sizes = order.map(() => 1);
  for (let i = order.length - 1; i > 0; i--) sizes[order[i].parent] += sizes[i];

  const start = new Array<number>(order.length).fill(0);
  const span = new Array<number>(order.length).fill(0);
  const cursor = new Array<number>(order.length).fill(0);
  start[0] = -Math.PI / 2;
  span[0] = 2 * Math.PI;
  cursor[0] = start[0];

  const nodes: RadialNode[] = [];
  const edges: Array<{ from: string; to: string }> = [];
  let maxGeneration = 0;

  for (let i = 0; i < order.length; i++) {
    const { node, parent, generation } = order[i];
    if (i > 0) {
      span[i] = (span[parent] * sizes[i]) / (sizes[parent] - 1);
      start[i] = cursor[parent];
      cursor[parent] += span[i];
      cursor[i] = start[i];
    }
    const angle = start[i] + span[i] / 2;
    const radius = generation * ringGap;
    nodes.push({
      id: node.recipe.id,
      x: generation === 0 ? 0 : radius * Math.cos(angle),
      y: generation === 0 ? 0 : radius * Math.sin(angle),
      generation,
      angle,
    });
    if (i > 0) edges.push({ from: order[parent].node.recipe.id, to: node.recipe.id });
    if (generation > maxGeneration) maxGeneration = generation;
  }

  const rings = Array.from({ length: maxGeneration }, (_, g) => (g + 1) * ringGap);
  return { nodes, edges, rings, size: 2 * (maxGeneration * ringGap + padding) };
}
