import { describe, expect, it } from 'vitest';
import { layoutRadial } from './radialLayout';
import type { TreeNode } from './tree';
import { makeRecipe } from '../test/factories';

const n = (id: string, children: TreeNode[] = []): TreeNode => ({
  recipe: makeRecipe({ id }),
  children,
});
const TWO_PI = 2 * Math.PI;

describe('layoutRadial', () => {
  it('places a lone root at the centre with no edges or rings', () => {
    const l = layoutRadial(n('r'));
    expect(l.nodes).toHaveLength(1);
    expect(l.nodes[0]).toMatchObject({ id: 'r', x: 0, y: 0, generation: 0 });
    expect(l.edges).toEqual([]);
    expect(l.rings).toEqual([]);
    expect(l.size).toBe(80);
  });

  it('puts one child at the bottom of ring 1 (middle of the full circle)', () => {
    const l = layoutRadial(n('r', [n('a')]));
    const a = l.nodes[1];
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(72);
    expect(l.edges).toEqual([{ from: 'r', to: 'a' }]);
    expect(l.rings).toEqual([72]);
  });

  it('spaces three equal children 120 degrees apart', () => {
    const l = layoutRadial(n('r', [n('a'), n('b'), n('c')]));
    const [, a, b, c] = l.nodes;
    expect(b.angle - a.angle).toBeCloseTo(TWO_PI / 3);
    expect(c.angle - b.angle).toBeCloseTo(TWO_PI / 3);
  });

  it('gives uneven subtrees proportional spans', () => {
    // a has subtree size 3, b has 1: spans 3/4 and 1/4 of the circle.
    const l = layoutRadial(n('r', [n('a', [n('a1'), n('a2')]), n('b')]));
    const byId = Object.fromEntries(l.nodes.map((x) => [x.id, x]));
    expect(byId.a.angle).toBeCloseTo(-Math.PI / 2 + (0.75 * TWO_PI) / 2);
    expect(byId.b.angle).toBeCloseTo(-Math.PI / 2 + 0.75 * TWO_PI + (0.25 * TWO_PI) / 2);
  });

  it('keeps each child angle within its parent span', () => {
    const tree = n('r', [n('a', [n('a1'), n('a2', [n('x')])]), n('b', [n('b1')]), n('c')]);
    const l = layoutRadial(tree);
    const byId = Object.fromEntries(l.nodes.map((x) => [x.id, x]));
    // Root-level spans: sizes a=5, b=2, c=1 of 8.
    const aSpan = (5 / 8) * TWO_PI;
    const aStart = -Math.PI / 2;
    for (const id of ['a1', 'a2', 'x']) {
      expect(byId[id].angle).toBeGreaterThanOrEqual(aStart - 1e-9);
      expect(byId[id].angle).toBeLessThanOrEqual(aStart + aSpan + 1e-9);
    }
    const bStart = aStart + aSpan;
    expect(byId.b1.angle).toBeGreaterThan(bStart);
    expect(byId.b1.angle).toBeLessThan(bStart + (2 / 8) * TWO_PI);
  });

  it('gives no two nodes the same position on a 20-version family', () => {
    const kids = Array.from({ length: 19 }, (_, i) =>
      i % 3 === 0 ? n(`k${i}`, [n(`g${i}`)]) : n(`k${i}`)
    );
    const l = layoutRadial(n('r', kids));
    const total = 1 + kids.length + kids.filter((_, i) => i % 3 === 0).length;
    expect(l.nodes).toHaveLength(total);
    const keys = new Set(l.nodes.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
    expect(keys.size).toBe(total);
  });

  it('puts generation g on radius g * ringGap and derives size', () => {
    const l = layoutRadial(n('r', [n('a', [n('b')])]), { ringGap: 50, padding: 10 });
    for (const p of l.nodes) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(p.generation * 50);
    }
    expect(l.rings).toEqual([50, 100]);
    expect(l.size).toBe(2 * (2 * 50 + 10));
  });

  it('handles a very deep chain without recursion overflow', () => {
    let tree = n('d0');
    const root = tree;
    for (let i = 1; i < 20000; i++) {
      const next = n(`d${i}`);
      tree.children = [next];
      tree = next;
    }
    const l = layoutRadial(root);
    expect(l.nodes).toHaveLength(20000);
    expect(l.rings).toHaveLength(19999);
  });

  it('skips duplicate ids and tolerates an empty children list', () => {
    const l = layoutRadial(n('r', [n('a'), n('a'), n('b', [])]));
    expect(l.nodes.map((p) => p.id)).toEqual(['r', 'a', 'b']);
    expect(l.edges).toHaveLength(2);
  });

  it('is deterministic', () => {
    const make = () => n('r', [n('a', [n('a1')]), n('b')]);
    expect(layoutRadial(make())).toEqual(layoutRadial(make()));
  });
});
