import { describe, it, expect } from 'vitest';
import { truncateNotificationMessage, NOTIFICATION_MESSAGE_MAX } from './notifications';

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
