import { describe, it, expect } from 'vitest';
import { truncateNotificationMessage, NOTIFICATION_MESSAGE_MAX, groupByDay } from './notifications';

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

describe('groupByDay', () => {
  const now = new Date(2026, 9, 19, 15, 0).getTime();
  const at = (d: number, h: number, m: number) => ({ createdAt: new Date(2026, 9, d, h, m).getTime() });

  it('puts 00:00 today in today and 23:59 yesterday in earlier, keeping order', () => {
    const items = [at(19, 14, 0), at(19, 0, 0), at(18, 23, 59), at(1, 8, 0)];
    const { today, earlier } = groupByDay(items, now);
    expect(today).toEqual([items[0], items[1]]);
    expect(earlier).toEqual([items[2], items[3]]);
  });
});
