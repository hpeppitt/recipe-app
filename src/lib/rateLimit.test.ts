import { describe, it, expect } from 'vitest';
// ?raw rather than node:fs, as in legal.test.ts.
import rules from '../../firestore.rules?raw';
import {
  nextWindow,
  SUGGESTION_CAP,
  REPLY_CAP,
  NOTIFICATION_CAP,
  RECIPE_CAP,
  COOK_CAP,
  COOKBOOK_CAP,
  WINDOW_MS,
  RECIPE_WINDOW_MS,
  RATE_LIMITS,
  RESET_MARGIN_MS,
} from './rateLimit';

const START = 1_000_000_000;
const HOUR = 3_600_000;

describe('nextWindow', () => {
  it('opens a window on the first write', () => {
    expect(nextWindow(null, START, 10, HOUR)).toEqual({ windowStartMs: START, count: 1 });
  });

  it('increments within the window and keeps windowStart', () => {
    expect(nextWindow({ windowStartMs: START, count: 3 }, START + 1000, 10, HOUR)).toEqual({
      windowStartMs: START,
      count: 4,
    });
  });

  it('allows the cap-th write and limits the next', () => {
    expect(nextWindow({ windowStartMs: START, count: 9 }, START + 1000, 10, HOUR)).toEqual({
      windowStartMs: START,
      count: 10,
    });
    expect(nextWindow({ windowStartMs: START, count: 10 }, START + 1000, 10, HOUR)).toBe('limited');
  });

  it('limits a window already above the cap', () => {
    expect(nextWindow({ windowStartMs: START, count: 15 }, START + 1000, 10, HOUR)).toBe('limited');
  });

  it('resets only once the window and the safety margin have passed', () => {
    const full = { windowStartMs: START, count: 10 };
    // Past the window but inside the margin: still limited at the cap...
    expect(nextWindow(full, START + HOUR + 1, 10, HOUR)).toBe('limited');
    expect(nextWindow(full, START + HOUR + RESET_MARGIN_MS, 10, HOUR)).toBe('limited');
    // ...and below the cap it increments rather than resetting early.
    expect(nextWindow({ windowStartMs: START, count: 4 }, START + HOUR + 1, 10, HOUR)).toEqual({
      windowStartMs: START,
      count: 5,
    });
    const after = START + HOUR + RESET_MARGIN_MS + 1;
    expect(nextWindow(full, after, 10, HOUR)).toEqual({ windowStartMs: after, count: 1 });
  });

  it('treats a windowStart in the future as an open window', () => {
    expect(nextWindow({ windowStartMs: START + HOUR, count: 2 }, START, 10, HOUR)).toEqual({
      windowStartMs: START + HOUR,
      count: 3,
    });
    expect(nextWindow({ windowStartMs: START + HOUR, count: 10 }, START, 10, HOUR)).toBe('limited');
  });
});

describe('firestore.rules write limits (RL-048)', () => {
  // Fails, rather than passing vacuously, when a function is renamed or removed.
  const literal = (fn: string) => {
    const m = new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return (\\d+);`).exec(rules);
    return m ? Number(m[1]) : undefined;
  };

  it('match the client constants', () => {
    expect(literal('suggestionCap')).toBe(SUGGESTION_CAP);
    expect(literal('replyCap')).toBe(REPLY_CAP);
    expect(literal('windowMs')).toBe(WINDOW_MS);
  });

  // One window bump in a batch must admit exactly one create, so each create
  // names its own path and the window's `last` must equal it.
  it('bind each create to the window bump by its own path', () => {
    expect(rules).toMatch(/getAfter\(path\)\.data\.last == docPath/);
    expect(rules).toContain("movedWindow('suggestion', 'suggestions/' + suggestionId)");
    expect(rules).toContain("movedWindow('reply', 'suggestions/' + suggestionId + '/messages/' + messageId)");
    expect(rules).toContain("hasOnly(['windowStart', 'count', 'at', 'last'])");
  });

  it('the comment block states the same numbers', () => {
    expect(rules).toContain(`suggestions  ${SUGGESTION_CAP} per hour`);
    expect(rules).toContain(`replies      ${REPLY_CAP} per hour`);
    expect(rules).toContain(`window       ${WINDOW_MS} ms`);
    expect(WINDOW_MS).toBe(HOUR);
  });
});

describe('per-action limits (RL-049)', () => {
  const literal = (fn: string) => {
    const m = new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return (\\d+);`).exec(rules);
    return m ? Number(m[1]) : undefined;
  };

  it('carry each action its own cap and window', () => {
    expect(RATE_LIMITS).toEqual({
      suggestion: { cap: SUGGESTION_CAP, windowMs: WINDOW_MS },
      reply: { cap: REPLY_CAP, windowMs: WINDOW_MS },
      notification: { cap: 60, windowMs: HOUR },
      recipe: { cap: 30, windowMs: 24 * HOUR },
      cook: { cap: 20, windowMs: 24 * HOUR },
      cookbook: { cap: 5, windowMs: 24 * HOUR },
    });
  });

  it('match the rules literals and comment block', () => {
    expect(literal('notificationCap')).toBe(NOTIFICATION_CAP);
    expect(literal('recipeCap')).toBe(RECIPE_CAP);
    expect(literal('recipeWindowMs')).toBe(RECIPE_WINDOW_MS);
    expect(rules).toContain(`notifications ${NOTIFICATION_CAP} per hour`);
    expect(rules).toContain(`recipes      ${RECIPE_CAP} per day`);
    expect(rules).toContain(`recipe window ${RECIPE_WINDOW_MS} ms`);
    expect(literal('cookCap')).toBe(COOK_CAP);
    expect(rules).toContain(`cooks        ${COOK_CAP} per day`);
    expect(literal('cookbookCap')).toBe(COOKBOOK_CAP);
    expect(rules).toContain(`cookbooks     ${COOKBOOK_CAP} per day (publishes: a collection becoming public)`);
  });

  it('the rules map every action to its cap and window function', () => {
    expect(rules).toContain(
      "{'suggestion': suggestionCap(), 'reply': replyCap(), 'notification': notificationCap(), 'recipe': recipeCap(), 'cook': cookCap(), 'cookbook': cookbookCap()}[action]"
    );
    expect(rules).toContain(
      "{'suggestion': windowMs(), 'reply': windowMs(), 'notification': windowMs(), 'recipe': recipeWindowMs(), 'cook': recipeWindowMs(), 'cookbook': recipeWindowMs()}[action]"
    );
    expect(rules).toContain("[u + '_suggestion', u + '_reply', u + '_notification', u + '_recipe', u + '_cook', u + '_cookbook']");
  });

  it('bind notification and recipe creates to their window bump', () => {
    expect(rules).toContain("movedWindow('notification', 'notifications/' + notificationId)");
    expect(rules).toContain("movedWindow('recipe', 'recipes/' + recipeId)");
    expect(rules).toContain("movedWindow('cook', 'cooks/' + cookId)");
    expect(rules).toContain("movedWindow('cookbook', 'collections/' + collectionId)");
  });

  it('the daily window resets only after a day plus the margin', () => {
    const { cap, windowMs } = RATE_LIMITS.recipe;
    const full = { windowStartMs: START, count: cap };
    expect(nextWindow(full, START + 2 * HOUR, cap, windowMs)).toBe('limited');
    expect(nextWindow(full, START + windowMs + RESET_MARGIN_MS, cap, windowMs)).toBe('limited');
    const after = START + windowMs + RESET_MARGIN_MS + 1;
    expect(nextWindow(full, after, cap, windowMs)).toEqual({ windowStartMs: after, count: 1 });
    expect(nextWindow({ windowStartMs: START, count: cap - 1 }, START + HOUR, cap, windowMs)).toEqual({
      windowStartMs: START,
      count: cap,
    });
  });
});
