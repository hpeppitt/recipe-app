import { describe, it, expect } from 'vitest';
import { buildTree, collectSubtreeIds } from './tree';
import { makeRecipe } from '../test/factories';

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
