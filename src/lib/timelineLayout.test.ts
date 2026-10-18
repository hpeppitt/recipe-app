import { describe, expect, it } from 'vitest';
import { makeRecipe } from '../test/factories';
import { layoutTimeline } from './timelineLayout';

const DAY = 86_400_000;
const r = (id: string, parentId: string | null, createdAt: number, prompt = '') =>
  makeRecipe({ id, parentId, createdAt, prompt });

describe('layoutTimeline', () => {
  it('handles empty and single inputs', () => {
    expect(layoutTimeline([])).toEqual({ stops: [], lines: [], width: 0, laneCount: 0 });
    const one = layoutTimeline([r('a', null, 1)]);
    expect(one.stops).toEqual([{ id: 'a', x: 32, lane: 0, line: 0, stopNumber: 1 }]);
    expect(one.width).toBe(64);
    expect(one.lines[0]).toMatchObject({ label: 'Original', colour: 'accent', branchFromId: null });
  });

  it('keeps a straight chain on one line', () => {
    const l = layoutTimeline([r('a', null, 1), r('b', 'a', 2), r('c', 'b', 3)]);
    expect(l.lines).toHaveLength(1);
    expect(l.stops.map((s) => s.stopNumber)).toEqual([1, 2, 3]);
    expect(l.laneCount).toBe(1);
  });

  it('branches a new line for two children', () => {
    const l = layoutTimeline([r('a', null, 1), r('b', 'a', 2, 'spicy'), r('c', 'a', 3, 'sweet')]);
    expect(l.lines).toHaveLength(2);
    expect(l.lines[1]).toMatchObject({ branchFromId: 'a', label: 'sweet', lane: 1, colour: 'accent-400' });
  });

  it('continues the trunk through the largest subtree', () => {
    const l = layoutTimeline([r('a', null, 1), r('b', 'a', 2), r('c', 'a', 3), r('d', 'c', 4)]);
    expect(l.lines[0].stopIds).toEqual(['a', 'c', 'd']);
    expect(l.lines[1].stopIds).toEqual(['b']);
  });

  it('breaks subtree ties by createdAt then id', () => {
    const byTime = layoutTimeline([r('a', null, 1), r('b', 'a', 5), r('c', 'a', 3)]);
    expect(byTime.lines[0].stopIds).toEqual(['a', 'c']);
    const byId = layoutTimeline([r('a', null, 1), r('z', 'a', 3), r('b', 'a', 3)]);
    expect(byId.lines[0].stopIds).toEqual(['a', 'b']);
  });

  it('trims labels and falls back to Variation', () => {
    const long = 'x'.repeat(40);
    const l = layoutTimeline([
      r('a', null, 1),
      r('b', 'a', 2, `  ${long}  `),
      r('c', 'a', 3, '   '),
      r('d', 'c', 4),
    ]);
    // c has the bigger subtree so b is the branch.
    expect(l.lines[1].label).toBe(`${'x'.repeat(32)}...`);
    const m = layoutTimeline([r('a', null, 1), r('b', 'a', 2, ''), r('c', 'a', 3, '')]);
    expect(m.lines[1].label).toBe('Variation');
  });

  it('cycles colours past seven lines', () => {
    const rs = [r('a', null, 1)];
    for (let i = 0; i < 9; i++) rs.push(r(`k${i}`, 'a', 2 + i));
    const colours = layoutTimeline(rs).lines.map((x) => x.colour);
    expect(colours.slice(0, 8)).toEqual([
      'accent', 'accent-400', 'accent-2', 'accent-600', 'accent-2-400', 'accent-700', 'accent-2-700', 'accent-600',
    ]);
  });

  it('puts parents first with zero and equal createdAt', () => {
    const l = layoutTimeline([r('c', 'b', 0), r('b', 'a', 0), r('a', null, 0)]);
    expect(l.stops.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    const xs = l.stops.map((s) => s.x);
    expect(xs[0] < xs[1] && xs[1] < xs[2]).toBe(true);
  });

  it('clamps gaps', () => {
    const l = layoutTimeline([r('a', null, 0), r('b', 'a', 1), r('c', 'b', 1 + 1000 * DAY), r('d', 'c', 2 + 1000 * DAY)]);
    expect(l.stops.map((s) => s.x)).toEqual([32, 88, 208, 264]);
    const t = layoutTimeline([r('a', null, 0), r('b', 'a', 10 * DAY)], { minGap: 10, maxGap: 500, msPerPx: DAY / 8 });
    expect(t.stops[1].x - t.stops[0].x).toBe(80);
  });

  it('has no lane collisions on a seeded random family', () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const rs = [r('n0', null, 1000)];
    for (let i = 1; i < 30; i++) rs.push(r(`n${i}`, `n${Math.floor(rand() * i)}`, 1000 + Math.floor(rand() * 20) * DAY));
    const l = layoutTimeline(rs);
    expect(l.stops).toHaveLength(30);
    expect(new Set(l.stops.map((s) => `${s.x}:${s.lane}`)).size).toBe(30);
    const x = new Map(l.stops.map((s) => [s.id, s.x]));
    for (const rec of rs) if (rec.parentId) expect(x.get(rec.id)!).toBeGreaterThan(x.get(rec.parentId)!);
    const span = (ln: (typeof l.lines)[number]) => [
      ln.branchFromId ? x.get(ln.branchFromId)! : x.get(ln.stopIds[0])!,
      x.get(ln.stopIds[ln.stopIds.length - 1])!,
    ];
    for (const a of l.lines)
      for (const b of l.lines) {
        if (a.index >= b.index || a.lane !== b.lane) continue;
        const [as, ae] = span(a);
        const [bs, be] = span(b);
        expect(as <= be && bs <= ae).toBe(false);
      }
  });

  it('is deterministic', () => {
    const rs = [r('a', null, 1), r('b', 'a', 2), r('c', 'a', 3), r('d', 'b', 4)];
    expect(layoutTimeline(rs)).toEqual(layoutTimeline([...rs].reverse()));
  });

  it('survives orphans, cycles and duplicate ids', () => {
    const orphan = layoutTimeline([r('a', null, 1), r('o', 'missing', 2)]);
    expect(orphan.stops).toHaveLength(2);
    expect(orphan.lines[0].stopIds).toEqual(['a']);
    const cyc = layoutTimeline([r('a', 'b', 1), r('b', 'a', 2)]);
    expect(cyc.stops.map((s) => s.id)).toEqual(['a', 'b']);
    expect(layoutTimeline([r('a', null, 1), r('a', null, 2)]).stops).toHaveLength(1);
  });
});
