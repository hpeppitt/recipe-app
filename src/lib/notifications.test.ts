import { describe, it, expect } from 'vitest';
import { truncateNotificationMessage, NOTIFICATION_MESSAGE_MAX, groupByDays, filterByChip, visibleFor, DEFAULT_NOTIFICATION_PREFS } from './notifications';
import type { AppNotification } from '../types/social';
// ?raw rather than node:fs, as in rateLimit.test.ts.
import rules from '../../firestore.rules?raw';

describe('truncateNotificationMessage', () => {
  it('leaves text under the limit unchanged', () => {
    expect(truncateNotificationMessage('less salt')).toBe('less salt');
  });

  it('leaves text exactly at the limit unchanged', () => {
    const text = 'a'.repeat(NOTIFICATION_MESSAGE_MAX);
    expect(truncateNotificationMessage(text)).toBe(text);
  });

  it('cuts text over the limit to the limit, ellipsis included', () => {
    const out = truncateNotificationMessage('a'.repeat(NOTIFICATION_MESSAGE_MAX + 1));
    expect(out).toHaveLength(500);
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1)).toBe('a'.repeat(499));
  });

  it('counts an emoji as two, the way the rules do, and never splits one', () => {
    // The rules' size() counts UTF-16 units, so 250 emoji is exactly the limit.
    const fits = '🍅'.repeat(250);
    expect(truncateNotificationMessage(fits)).toBe(fits);
    // 499 units would end on half an emoji, so the cut drops it.
    const out = truncateNotificationMessage('🍅'.repeat(300));
    expect(out).toBe('🍅'.repeat(249) + '…');
    expect(out.length).toBeLessThanOrEqual(500);
  });
});

describe('groupByDays', () => {
  const now = new Date(2026, 9, 19, 15, 0).getTime(); // Monday 19 Oct 2026
  const at = (d: number, h = 12, m = 0, mo = 9, y = 2026) => ({ createdAt: new Date(y, mo, d, h, m).getTime() });
  const labels = (items: { createdAt: number }[], when = now) => groupByDays(items, when).map((g) => g.label);

  it('labels each range and keeps order within a group', () => {
    const items = [at(19, 14), at(19, 1), at(18), at(17), at(13), at(12), at(1)];
    const out = groupByDays(items, now);
    expect(out.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Saturday', 'Tuesday', '12 Oct', '1 Oct']);
    expect(out[0].items).toEqual([items[0], items[1]]);
  });

  it('puts 00:00 today in Today and 23:59 yesterday in Yesterday', () => {
    expect(labels([at(19, 0, 0), at(18, 23, 59)])).toEqual(['Today', 'Yesterday']);
  });

  it('uses weekday names for 2 to 6 days ago and a date at 7', () => {
    expect(labels([at(17), at(13), at(12)])).toEqual(['Saturday', 'Tuesday', '12 Oct']);
  });

  it('adds the year only when it is not the current year', () => {
    const jan = new Date(2026, 0, 20, 10).getTime();
    expect(labels([at(30, 12, 0, 11, 2025)], jan)).toEqual(['30 Dec 2025']);
    expect(labels([at(1, 12, 0, 0, 2026)], jan)).toEqual(['1 Jan']);
  });

  it('counts calendar days across a DST change', () => {
    // UK clocks went back on 25 Oct 2026, so 25 Oct is 25 hours long.
    const after = new Date(2026, 9, 26, 0, 30).getTime();
    expect(labels([at(25, 0, 30), at(24, 23, 30)], after)).toEqual(['Yesterday', 'Saturday']);
  });

  it('treats a future timestamp as Today', () => {
    expect(labels([at(20)])).toEqual(['Today']);
  });
});

describe('filterByChip', () => {
  const types = ['favorite', 'follow', 'suggestion', 'suggestion_reply', 'suggestion_approved', 'suggestion_rejected', 'suggestion_applied', 'suggestion_branched', 'branch', 'mystery'];
  const items = types.map((type) => ({ type }));
  const pick = (chip: Parameters<typeof filterByChip>[1]) => filterByChip(items, chip).map((i) => i.type);

  it('All keeps everything, including favorite and unknown types', () => {
    expect(pick('all')).toEqual(types);
  });
  it('Branches, Suggestions and Follows pick their types only', () => {
    expect(pick('branches')).toEqual(['suggestion_branched', 'branch']);
    expect(pick('suggestions')).toEqual(['suggestion', 'suggestion_reply', 'suggestion_approved', 'suggestion_rejected', 'suggestion_applied']);
    expect(pick('follows')).toEqual(['follow']);
  });
});

describe('firestore.rules notification types', () => {
  // A Record over the union, so a type added to AppNotification fails to compile until listed here.
  const clientTypes: Record<AppNotification['type'], true> = {
    favorite: true,
    follow: true,
    suggestion: true,
    suggestion_reply: true,
    suggestion_approved: true,
    suggestion_rejected: true,
    suggestion_applied: true,
    suggestion_branched: true,
    branch: true,
  };
  const ruleTypes = [...rules.matchAll(/request\.resource\.data\.type in \[([^\]]+)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((t) => t[1]),
  );

  it('the rules allow every type the client knows', () => {
    for (const type of Object.keys(clientTypes)) expect(ruleTypes).toContain(type);
  });

  it('the rules allow the suggestion outcome types (RL-146)', () => {
    expect(ruleTypes).toContain('suggestion_applied');
    expect(ruleTypes).toContain('suggestion_branched');
  });

  it('the rules allow a branch notification (RL-152)', () => {
    expect(ruleTypes).toContain('branch');
  });
});

describe('visibleFor', () => {
  const types = ['branch', 'suggestion', 'suggestion_reply', 'follow', 'favorite', 'suggestion_applied', 'suggestion_branched', 'suggestion_approved', 'suggestion_rejected'];
  const rows = types.map((type) => ({ type }));
  const shown = (p: Partial<typeof DEFAULT_NOTIFICATION_PREFS>) => visibleFor(rows, { ...DEFAULT_NOTIFICATION_PREFS, ...p }).map((r) => r.type);
  it('shows everything by default', () => expect(shown({})).toEqual(types));
  it('branch off hides branch only', () => expect(shown({ branch: false })).toEqual(types.filter((t) => t !== 'branch')));
  it('suggestion off hides suggestion and suggestion_reply, not outcomes', () =>
    expect(shown({ suggestion: false })).toEqual(types.filter((t) => t !== 'suggestion' && t !== 'suggestion_reply')));
  it('follow off hides follow only', () => expect(shown({ follow: false })).toEqual(types.filter((t) => t !== 'follow')));
  it('all off still shows favorite and outcomes', () =>
    expect(shown({ branch: false, suggestion: false, follow: false })).toEqual(['favorite', 'suggestion_applied', 'suggestion_branched', 'suggestion_approved', 'suggestion_rejected']));
});
