import { describe, it, expect } from 'vitest';
import { EXPLORE_TAG_FIELD, FEED_ORDER_FIELD } from './constants';
import indexes from '../../firestore.indexes.json';

type Index = { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order?: string; arrayConfig?: string }[] };

describe('firestore.indexes.json', () => {
  // getPublishedRecipesPage with a tag: where tags array-contains + orderBy createdAt desc.
  it('has the composite index the Explore tag query needs (RL-009)', () => {
    const found = (indexes.indexes as Index[]).some(
      (i) =>
        i.collectionGroup === 'recipes' &&
        i.queryScope === 'COLLECTION' &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === EXPLORE_TAG_FIELD &&
        i.fields[0].arrayConfig === 'CONTAINS' &&
        i.fields[1].fieldPath === FEED_ORDER_FIELD &&
        i.fields[1].order === 'DESCENDING'
    );
    expect(found).toBe(true);
  });

  // getRecipeCookSummary and subscribeOwnCooks: one equality + orderBy createdAt desc (RL-196).
  it.each(['recipeId', 'uid'])('has the cooks %s + createdAt desc index (RL-196)', (field) => {
    const found = (indexes.indexes as Index[]).some(
      (i) =>
        i.collectionGroup === 'cooks' &&
        i.queryScope === 'COLLECTION' &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === field &&
        i.fields[0].order === 'ASCENDING' &&
        i.fields[1].fieldPath === 'createdAt' &&
        i.fields[1].order === 'DESCENDING'
    );
    expect(found).toBe(true);
  });
});
