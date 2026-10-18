import type { Recipe } from '../types/recipe';

export interface TimelineOptions {
  minGap?: number;
  maxGap?: number;
  msPerPx?: number;
  padding?: number;
}

export interface TimelineStop {
  id: string;
  x: number;
  lane: number;
  line: number;
  /** 1-based position along its line. */
  stopNumber: number;
}

export interface TimelineLine {
  index: number;
  lane: number;
  label: string;
  /** Token name (for example "accent-400"), mapped to a CSS variable by the view. */
  colour: string;
  stopIds: string[];
  branchFromId: string | null;
}

export interface TimelineLayout {
  stops: TimelineStop[];
  lines: TimelineLine[];
  width: number;
  laneCount: number;
}

const COLOURS = ['accent', 'accent-400', 'accent-2'];
const CYCLE = ['accent-600', 'accent-2-400', 'accent-700', 'accent-2-700'];
const LABEL_MAX = 32;

export function lineColour(index: number): string {
  return index < COLOURS.length ? COLOURS[index] : CYCLE[(index - COLOURS.length) % CYCLE.length];
}

function lineLabel(index: number, prompt: string): string {
  if (index === 0) return 'Original';
  const p = (prompt ?? '').trim();
  if (!p) return 'Variation';
  // Three dots, not U+2026, so the label is plain ASCII.
  return p.length > LABEL_MAX ? `${p.slice(0, LABEL_MAX).trimEnd()}...` : p;
}

const byTimeThenId = (a: Recipe, b: Recipe) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Lays a version family out as a subway map. Pure and deterministic.
 * Degenerate input is tolerated: duplicate ids keep the first, a recipe whose parent is
 * missing is an additional root attached after the trunk, and a parentId cycle is broken at
 * its earliest member, which is then treated as a root.
 */
export function layoutTimeline(recipes: Recipe[], options: TimelineOptions = {}): TimelineLayout {
  const minGap = options.minGap ?? 56;
  const maxGap = Math.max(minGap, options.maxGap ?? 120);
  const msPerPx = options.msPerPx && options.msPerPx > 0 ? options.msPerPx : 86_400_000 / 8;
  const padding = options.padding ?? 32;

  const byId = new Map<string, Recipe>();
  for (const r of recipes) if (!byId.has(r.id)) byId.set(r.id, r);
  if (byId.size === 0) return { stops: [], lines: [], width: 0, laneCount: 0 };
  const all = [...byId.values()].sort(byTimeThenId);

  // Effective forest: each node is reached once, so cycles cannot loop.
  const children = new Map<string, Recipe[]>();
  const parentOf = new Map<string, string | null>();
  const visited = new Set<string>();
  const roots: Recipe[] = [];
  const walk = (root: Recipe) => {
    roots.push(root);
    visited.add(root.id);
    parentOf.set(root.id, null);
    const stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      const kids = all.filter((r) => r.parentId === node.id && !visited.has(r.id));
      for (const k of kids) {
        visited.add(k.id);
        parentOf.set(k.id, node.id);
      }
      children.set(node.id, kids);
      stack.push(...kids);
    }
  };
  const isRoot = (r: Recipe) => r.parentId === null || !byId.has(r.parentId) || r.parentId === r.id;
  // Genuine root first so it becomes the trunk, then orphans in time order.
  const genuine = all.filter((r) => r.parentId === null);
  for (const r of [...genuine, ...all.filter((r) => isRoot(r) && r.parentId !== null)]) if (!visited.has(r.id)) walk(r);
  for (const r of all) if (!visited.has(r.id)) walk(r); // cycle members

  const size = new Map<string, number>();
  const sizeOf = (id: string): number => {
    // Post-order without recursion so deep chains are safe.
    const order: string[] = [];
    const st = [id];
    while (st.length) {
      const n = st.pop()!;
      order.push(n);
      for (const k of children.get(n) ?? []) st.push(k.id);
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i];
      size.set(n, 1 + (children.get(n) ?? []).reduce((s, k) => s + size.get(k.id)!, 0));
    }
    return size.get(id)!;
  };
  for (const r of roots) sizeOf(r.id);
  for (const list of children.values()) {
    list.sort((a, b) => size.get(b.id)! - size.get(a.id)! || byTimeThenId(a, b));
  }

  // Lines: follow the largest-subtree child; every other child starts a new line.
  const lineOf = new Map<string, number>();
  const lines: TimelineLine[] = [];
  const queue: { start: Recipe; from: string | null }[] = roots.map((r) => ({ start: r, from: null }));
  // Roots are queued in order, trunk first; branches are appended as they are found.
  for (let q = 0; q < queue.length; q++) {
    const { start, from } = queue[q];
    const index = lines.length;
    const stopIds: string[] = [];
    let node: Recipe | undefined = start;
    while (node) {
      stopIds.push(node.id);
      lineOf.set(node.id, index);
      const kids: Recipe[] = children.get(node.id) ?? [];
      for (const k of kids.slice(1)) queue.push({ start: k, from: node.id });
      node = kids[0];
    }
    lines.push({ index, lane: 0, label: lineLabel(index, start.prompt), colour: lineColour(index), stopIds, branchFromId: from });
  }

  // Order: Kahn's algorithm picking the earliest ready (createdAt, id), so parents come first.
  const waiting = new Map<string, number>();
  for (const r of all) waiting.set(r.id, parentOf.get(r.id) === null ? 0 : 1);
  const ready = all.filter((r) => waiting.get(r.id) === 0);
  const ordered: Recipe[] = [];
  while (ready.length) {
    ready.sort(byTimeThenId);
    const next = ready.shift()!;
    ordered.push(next);
    for (const k of children.get(next.id) ?? []) ready.push(k);
  }

  const xOf = new Map<string, number>();
  ordered.forEach((r, i) => {
    if (i === 0) return xOf.set(r.id, padding);
    const prev = ordered[i - 1];
    const gap = Math.min(maxGap, Math.max(minGap, (r.createdAt - prev.createdAt) / msPerPx));
    xOf.set(r.id, xOf.get(prev.id)! + gap);
  });

  // Lanes: trunk is 0; others take the lowest lane with no overlapping span (inclusive).
  const placed: { lane: number; start: number; end: number }[] = [];
  for (const line of lines) {
    const end = xOf.get(line.stopIds[line.stopIds.length - 1])!;
    const start = line.branchFromId ? xOf.get(line.branchFromId)! : xOf.get(line.stopIds[0])!;
    let lane = 0;
    if (line.index > 0) {
      while (placed.some((p) => p.lane === lane && p.start <= end && start <= p.end)) lane++;
    }
    line.lane = lane;
    placed.push({ lane, start, end });
  }

  const stops: TimelineStop[] = ordered.map((r) => {
    const line = lines[lineOf.get(r.id)!];
    return { id: r.id, x: xOf.get(r.id)!, lane: line.lane, line: line.index, stopNumber: line.stopIds.indexOf(r.id) + 1 };
  });
  const last = stops[stops.length - 1];
  return { stops, lines, width: last.x + padding, laneCount: Math.max(...lines.map((l) => l.lane)) + 1 };
}
