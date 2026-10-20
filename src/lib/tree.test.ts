import { describe, it, expect } from 'vitest';
import { MAX_MOVED_CHILDREN, ancestorChain, buildTree, collectSubtreeIds, countDescendantsByRoot, familySubtitle } from './tree';
import { makeRecipe } from '../test/factories';
import rules from '../../firestore.rules?raw';

describe('MAX_MOVED_CHILDREN', () => {
  // Emulator passed 18, denied 19 (RL-158 Notes); held at 8 until RL-160 probes production.
  it('stays at the conservative cap until production is probed', () => expect(MAX_MOVED_CHILDREN).toBe(8));
  it('is named in firestore.rules', () => expect(rules).toContain('MAX_MOVED_CHILDREN'));
});

describe('collectSubtreeIds', () => {
  const nodes = [
    { id: 'root', parentId: null },
    { id: 'a', parentId: 'root' },
    { id: 'b', parentId: 'root' },
    { id: 'a1', parentId: 'a' },
    { id: 'a2', parentId: 'a' },
    { id: 'a1x', parentId: 'a1' },
  ];

  it('collects a node with all of its descendants, depth first or not', () => {
    expect(collectSubtreeIds(nodes, 'a').sort()).toEqual(['a', 'a1', 'a1x', 'a2']);
  });

  it('collects the whole tree from the root', () => {
    expect(collectSubtreeIds(nodes, 'root')).toHaveLength(6);
  });

  it('returns just the id for a leaf', () => {
    expect(collectSubtreeIds(nodes, 'a1x')).toEqual(['a1x']);
  });

  it('does not collect siblings or ancestors', () => {
    const result = collectSubtreeIds(nodes, 'a');
    expect(result).not.toContain('b');
    expect(result).not.toContain('root');
  });

  it('returns the id itself when it is absent from the node list', () => {
    // The cloud tree may not contain a recipe that exists locally.
    expect(collectSubtreeIds(nodes, 'unknown')).toEqual(['unknown']);
  });

  it('terminates on a parent cycle instead of looping forever', () => {
    const cyclic = [
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' },
    ];

    expect(collectSubtreeIds(cyclic, 'x').sort()).toEqual(['x', 'y']);
  });
});

describe('buildTree', () => {
  it('returns null for an empty list', () => {
    expect(buildTree([])).toBeNull();
  });

  it('returns null when no root (parentId === null) exists', () => {
    const orphan = makeRecipe({ id: 'a', parentId: 'missing' });
    expect(buildTree([orphan])).toBeNull();
  });

  it('nests children under their parents', () => {
    const root = makeRecipe({ id: 'root' });
    const child = makeRecipe({ id: 'child', parentId: 'root' });
    const grandchild = makeRecipe({ id: 'grandchild', parentId: 'child' });

    const tree = buildTree([root, child, grandchild]);

    expect(tree?.recipe.id).toBe('root');
    expect(tree?.children[0].recipe.id).toBe('child');
    expect(tree?.children[0].children[0].recipe.id).toBe('grandchild');
  });

  it('sorts siblings by createdAt ascending', () => {
    const root = makeRecipe({ id: 'root' });
    const late = makeRecipe({ id: 'late', parentId: 'root', createdAt: 300 });
    const early = makeRecipe({ id: 'early', parentId: 'root', createdAt: 100 });

    const tree = buildTree([root, late, early]);

    expect(tree?.children.map((c) => c.recipe.id)).toEqual(['early', 'late']);
  });
});

describe('countDescendantsByRoot', () => {
  it('counts a subtree without counting the root itself', () => {
    const counts = countDescendantsByRoot([
      { id: 'root', rootId: 'root' },
      { id: 'a', rootId: 'root' },
      { id: 'b', rootId: 'root' },
    ]);

    expect(counts.get('root')).toBe(2);
  });

  it('does not double-count a recipe present both locally and in the cloud', () => {
    // The feed merges two stores; the same variation appears in both.
    const counts = countDescendantsByRoot([
      { id: 'a', rootId: 'root' },
      { id: 'a', rootId: 'root' },
      { id: 'b', rootId: 'root' },
    ]);

    expect(counts.get('root')).toBe(2);
  });

  it('reports nothing for a root with no variations', () => {
    const counts = countDescendantsByRoot([{ id: 'root', rootId: 'root' }]);
    expect(counts.get('root')).toBeUndefined();
  });
});

describe('ancestorChain', () => {
  const root = makeRecipe({ id: 'root', parentId: null });
  const a = makeRecipe({ id: 'a', parentId: 'root' });
  const b = makeRecipe({ id: 'b', parentId: 'a' });

  it('returns root first and excludes the id', () => {
    expect(ancestorChain([b, root, a], 'b').map((r) => r.id)).toEqual(['root', 'a']);
  });

  it('is empty for the root', () => {
    expect(ancestorChain([root, a], 'root')).toEqual([]);
  });

  it('stops at a missing parent', () => {
    expect(ancestorChain([a, b], 'b').map((r) => r.id)).toEqual(['a']);
  });

  it('survives a cycle', () => {
    const x = makeRecipe({ id: 'x', parentId: 'y' });
    const y = makeRecipe({ id: 'y', parentId: 'x' });
    expect(ancestorChain([x, y], 'x').map((r) => r.id)).toEqual(['y']);
  });
});

describe('familySubtitle', () => {
  const now = new Date(2026, 9, 18);
  const by = (uid: string, displayName: string | null) => ({ uid, displayName });
  const march = new Date(2026, 2, 10).getTime();
  const root = (over = {}) =>
    makeRecipe({ id: 'root', parentId: null, createdAt: march, createdBy: by('u1', 'Ada'), ...over });
  const child = (uid: string) => makeRecipe({ id: `c-${uid}`, parentId: 'root', createdBy: by(uid, null) });

  it('counts versions and distinct cooks', () => {
    expect(familySubtitle([root(), child('u1'), child('u2')], now)).toBe(
      '3 versions, 2 cooks, started by Ada in March'
    );
  });

  it('uses singulars', () => {
    expect(familySubtitle([root()], now)).toBe('1 version, 1 cook, started by Ada in March');
  });

  it('drops a null name', () => {
    expect(familySubtitle([root({ createdBy: by('u1', null) })], now)).toBe('1 version, 1 cook, started in March');
  });

  it('drops the month when createdAt is 0', () => {
    expect(familySubtitle([root({ createdAt: 0 })], now)).toBe('1 version, 1 cook, started by Ada');
  });

  it('appends the year when it is not this year', () => {
    const old = new Date(2025, 2, 10).getTime();
    expect(familySubtitle([root({ createdAt: old })], now)).toContain('in March 2025');
  });
});
