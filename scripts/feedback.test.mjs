import { describe, it, expect } from 'vitest';
import {
  parseArgs, parseOlderThan, pruneCutoff, selectOlderThan, dryRunReason, fileBase,
  decodeScreenshot, newestFirst, formatListEntry, formatNote, planSave, clean, line, batches, partialMessage, ID_RE,
} from './feedback.mjs';

const item = (o = {}) => ({
  id: 'abc123', uid: 'uidX', displayName: 'Sam', note: 'Line one\nLine two', path: '/explore',
  appVersion: '0.4.0', viewport: '390x844', theme: 'dark', userAgent: 'UA', screenshot: null,
  createdAt: '2026-10-20T09:30:00.000Z', ...o,
});
const JPG = 'data:image/jpeg;base64,/9j/4AAQ';

describe('parseArgs', () => {
  it('accepts each command', () => {
    expect(parseArgs(['list', '--emulator']).command).toBe('list');
    expect(parseArgs(['save', 'out', '--project', 'p']).args).toEqual(['out']);
    expect(parseArgs(['delete', 'a', 'b', '--confirm', 'p']).args).toEqual(['a', 'b']);
    expect(parseArgs(['prune', '--older-than', '365d']).olderThan).toBe('365d');
  });
  it('rejects bad input', () => {
    expect(parseArgs(['nope']).error).toMatch(/unknown command/);
    expect(parseArgs(['delete']).error).toMatch(/at least one id/);
    expect(parseArgs(['delete', '../x']).error).toMatch(/not a valid/);
    expect(parseArgs(['prune']).error).toMatch(/--older-than/);
    expect(parseArgs(['prune', '--older-than', '1y']).error).toMatch(/365d/);
    expect(parseArgs(['list', '--confirm', 'p']).error).toMatch(/delete and prune/);
    expect(parseArgs(['save']).error).toMatch(/one directory/);
    expect(parseArgs(['list', '--wat']).error).toMatch(/unknown flag/);
  });
});

describe('prune cutoff', () => {
  it('parses days only', () => {
    expect(parseOlderThan('365d')).toBe(365);
    expect(parseOlderThan('0d')).toBeNull();
    expect(parseOlderThan('12m')).toBeNull();
  });
  it('selects strictly older items', () => {
    const now = new Date('2026-10-22T00:00:00.000Z');
    const cutoff = pruneCutoff(365, now);
    expect(cutoff.toISOString()).toBe('2025-10-22T00:00:00.000Z');
    const old = item({ id: 'old', createdAt: '2025-10-21T23:59:59.000Z' });
    const edge = item({ id: 'edge', createdAt: '2025-10-22T00:00:00.000Z' });
    expect(selectOlderThan([old, edge, item()], cutoff).map((i) => i.id)).toEqual(['old']);
  });
});

describe('dryRunReason', () => {
  it('runs only when confirm equals the project', () => {
    expect(dryRunReason({ confirm: 'p' }, 'p')).toBeNull();
    expect(dryRunReason({ confirm: null }, 'p')).toMatch(/--confirm p/);
    expect(dryRunReason({ confirm: 'q' }, 'p')).toMatch(/not the project id/);
  });
});

describe('screenshots and files', () => {
  it('decodes a JPEG data URL and refuses others', () => {
    expect(decodeScreenshot(JPG)?.[0]).toBe(0xff);
    expect(decodeScreenshot('data:image/png;base64,AAAA')).toBeNull();
    expect(decodeScreenshot(null)).toBeNull();
  });
  it('names files date-id', () => {
    expect(fileBase(item())).toBe('2026-10-20-abc123');
    expect(planSave(item({ screenshot: JPG })).map((f) => f.name)).toEqual(['2026-10-20-abc123.jpg', '2026-10-20-abc123.md']);
    expect(planSave(item()).map((f) => f.name)).toEqual(['2026-10-20-abc123.md']);
  });
  it('note holds every field but the screenshot data', () => {
    const md = formatNote(item({ screenshot: JPG }), '2026-10-20-abc123.jpg');
    for (const s of ['uidX', 'Sam', '/explore', '0.4.0', '390x844', 'dark', 'UA', 'Line two', '2026-10-20-abc123.jpg']) expect(md).toContain(s);
    expect(md).not.toContain('/9j/');
  });
});

describe('list', () => {
  it('sorts newest first', () => {
    const a = item({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = item({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' });
    expect(newestFirst([a, b]).map((i) => i.id)).toEqual(['b', 'a']);
  });
  it('prints every column and indents the note', () => {
    const out = formatListEntry(item({ screenshot: JPG }));
    expect(out).toContain('2026-10-20 | Sam | uidX | /explore | 0.4.0 | 390x844 | dark | screenshot');
    expect(out).toContain('    Line two');
    expect(formatListEntry(item({ displayName: null }))).toContain('(no name)');
  });
});

describe('safety helpers', () => {
  it('strips C0 and C1 controls including ESC, keeping newlines in notes', () => {
    expect(clean('a\x1b[31mb\x07\x9bc\x7fd')).toBe('a[31mbcd');
    expect(clean('x\ny')).toBe('x\ny');
    expect(line('x\ny\x1b')).toBe('x y');
    expect(formatListEntry(item({ note: 'hi\x1b[2J', displayName: 'S\x1bam' }))).not.toContain('\x1b');
    expect(formatNote(item({ userAgent: 'U\x1bA', note: 'n\x9b' }))).not.toMatch(/[\x1b\x9b]/);
  });
  it('the .md names the jpg only when it decoded', () => {
    expect(planSave(item({ screenshot: 'data:image/png;base64,AAAA' }))[0].data).toContain('- screenshot: none');
    expect(planSave(item({ screenshot: JPG }))[1].data).toContain('- screenshot: 2026-10-20-abc123.jpg');
  });
  it('batches ids and words a partial failure', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([])).toEqual([]);
    expect(partialMessage(400, 900)).toBe('400 of 900 deleted; rerun to finish');
  });
  it('id check', () => {
    expect(ID_RE.test('abc_1-Z')).toBe(true);
    expect(ID_RE.test('../x')).toBe(false);
  });
});
