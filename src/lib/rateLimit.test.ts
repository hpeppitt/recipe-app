import { describe, it, expect } from 'vitest';
// ?raw rather than node:fs, as in legal.test.ts.
import rules from '../../firestore.rules?raw';
import { nextWindow, SUGGESTION_CAP, REPLY_CAP, WINDOW_MS, RESET_MARGIN_MS } from './rateLimit';

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
