import { describe, it, expect } from 'vitest';
import {
  parseIntroState,
  hasSeen,
  markSeen,
  countRecipeViewed,
  shouldShowTreeIntro,
  EMPTY_INTRO_STATE,
  TREE_INTRO_MIN_RECIPES,
  type IntroState,
} from './onboarding';

const ready: IntroState = { seen: [], recipesViewed: TREE_INTRO_MIN_RECIPES };

describe('parseIntroState', () => {
  it('treats absent storage as nothing seen', () => {
    expect(parseIntroState(null)).toEqual(EMPTY_INTRO_STATE);
  });

  it('round-trips a real value', () => {
    const state: IntroState = { seen: ['recipe-tree'], recipesViewed: 3 };
    expect(parseIntroState(JSON.stringify(state))).toEqual(state);
  });

  // localStorage is user-editable and older builds may have written another
  // shape. Throwing on load would break the whole page for a cosmetic feature.
  it('falls back rather than throwing on malformed JSON', () => {
    expect(parseIntroState('{not json')).toEqual(EMPTY_INTRO_STATE);
  });

  it('discards a non-array seen list', () => {
    expect(parseIntroState('{"seen":"recipe-tree","recipesViewed":5}').seen).toEqual([]);
  });

  it('discards non-string entries in seen', () => {
    expect(parseIntroState('{"seen":["recipe-tree",7,null]}').seen).toEqual(['recipe-tree']);
  });

  it('rejects a negative or non-numeric view count', () => {
    expect(parseIntroState('{"recipesViewed":-4}').recipesViewed).toBe(0);
    expect(parseIntroState('{"recipesViewed":"lots"}').recipesViewed).toBe(0);
  });

  it('floors a fractional count rather than carrying it', () => {
    expect(parseIntroState('{"recipesViewed":2.7}').recipesViewed).toBe(2);
  });
});

describe('markSeen', () => {
  it('records an id', () => {
    expect(hasSeen(markSeen(EMPTY_INTRO_STATE, 'recipe-tree'), 'recipe-tree')).toBe(true);
  });

  it('does not duplicate, and returns the same object when already seen', () => {
    const once = markSeen(EMPTY_INTRO_STATE, 'recipe-tree');
    const twice = markSeen(once, 'recipe-tree');
    expect(twice).toBe(once);
    expect(twice.seen).toEqual(['recipe-tree']);
  });

  it('leaves the view count alone', () => {
    expect(markSeen(ready, 'recipe-tree').recipesViewed).toBe(TREE_INTRO_MIN_RECIPES);
  });
});

describe('countRecipeViewed', () => {
  it('increments', () => {
    expect(countRecipeViewed(EMPTY_INTRO_STATE).recipesViewed).toBe(1);
  });

  it('does not mutate the input', () => {
    const state = { ...EMPTY_INTRO_STATE };
    countRecipeViewed(state);
    expect(state.recipesViewed).toBe(0);
  });
});

describe('shouldShowTreeIntro', () => {
  const root = { depth: 0 };
  const variation = { depth: 1 };

  it('shows on a root recipe once enough recipes have been seen', () => {
    expect(shouldShowTreeIntro(ready, root)).toBe(true);
  });

  // On the first recipe the user is still working out what the page is.
  it('holds back until the user has opened a couple of recipes', () => {
    expect(shouldShowTreeIntro({ seen: [], recipesViewed: 0 }, root)).toBe(false);
    expect(shouldShowTreeIntro({ seen: [], recipesViewed: 1 }, root)).toBe(false);
  });

  it('never shows again once dismissed', () => {
    expect(shouldShowTreeIntro({ seen: ['recipe-tree'], recipesViewed: 99 }, root)).toBe(false);
  });

  // A variation already demonstrates the concept via its breadcrumb and parent
  // preview; an abstract explainer beside a live example is worse than neither.
  it('stays off a variation, which is already a live example', () => {
    expect(shouldShowTreeIntro(ready, variation)).toBe(false);
  });

  it('is false with no recipe', () => {
    expect(shouldShowTreeIntro(ready, null)).toBe(false);
    expect(shouldShowTreeIntro(ready, undefined)).toBe(false);
  });
});
