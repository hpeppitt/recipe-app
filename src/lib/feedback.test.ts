import { describe, it, expect } from 'vitest';
import { cutUnits, cleanNote, feedbackContext, FEEDBACK_NOTE_MAX } from './feedback';

const base = { pathname: '/recipe/abc', width: 390, height: 844, theme: 'dark' as const, userAgent: 'UA', appVersion: '0.4.0' };

describe('feedbackContext', () => {
  it('formats the viewport and drops query and hash', () => {
    expect(feedbackContext({ ...base, pathname: '/recipe/abc?x=1#top' })).toEqual({
      path: '/recipe/abc', appVersion: '0.4.0', viewport: '390x844', theme: 'dark', userAgent: 'UA',
    });
  });
  it('truncates to the rule limits and keeps a leading slash', () => {
    const c = feedbackContext({ ...base, pathname: 'x'.repeat(500), userAgent: 'u'.repeat(900), appVersion: 'v'.repeat(90) });
    expect(c.path).toHaveLength(300);
    expect(c.path.startsWith('/')).toBe(true);
    expect(c.userAgent).toHaveLength(400);
    expect(c.appVersion).toHaveLength(40);
  });
});

describe('cleanNote', () => {
  it('trims, and a whitespace-only note becomes empty', () => {
    expect(cleanNote('  hi \n')).toBe('hi');
    expect(cleanNote(' \n\t ')).toBe('');
  });
  it('caps at 1000 units', () => {
    expect(cleanNote('a'.repeat(1500))).toHaveLength(FEEDBACK_NOTE_MAX);
  });
});

describe('privacy and boundaries', () => {
  it('redacts a join code but keeps public ids', () => {
    expect(feedbackContext({ ...base, pathname: '/join/SECRET1?x=1' }).path).toBe('/join/:code');
    expect(feedbackContext({ ...base, pathname: '/c/abc' }).path).toBe('/c/abc');
    expect(feedbackContext({ ...base, pathname: '/shared/abc' }).path).toBe('/shared/abc');
  });
  it('never splits a surrogate pair', () => {
    expect(cutUnits('a😀', 2)).toBe('a');
    expect(cutUnits('a😀', 3)).toBe('a😀');
    expect(cleanNote('a'.repeat(999) + '😀')).toBe('a'.repeat(999));
    expect(feedbackContext({ ...base, userAgent: 'u'.repeat(399) + '😀' }).userAgent).toBe('u'.repeat(399));
  });
});
