import { describe, it, expect } from 'vitest';
import { replyRecipient } from './suggestions';
import type { Suggestion } from '../types/social';

const suggestion = (recipeOwnerId: string, suggesterUid: string): Suggestion => ({
  id: 's1',
  recipeId: 'r1',
  recipeOwnerId,
  recipeTitle: 'Test',
  suggestedBy: { uid: suggesterUid, displayName: 'Suggester' },
  message: 'less salt',
  status: 'pending',
  createdAt: 0,
});

describe('replyRecipient', () => {
  it('notifies the suggester when the owner replies', () => {
    expect(replyRecipient(suggestion('owner', 'suggester'), 'owner')).toBe('suggester');
  });

  it('notifies the owner when the suggester replies', () => {
    // The direction that a hardcoded "notify the owner" would get right by
    // accident, which is why the other case above matters more.
    expect(replyRecipient(suggestion('owner', 'suggester'), 'suggester')).toBe('owner');
  });

  it('returns null when both sides are the same person', () => {
    // An owner suggesting a change on their own recipe should not be told about
    // their own reply.
    expect(replyRecipient(suggestion('owner', 'owner'), 'owner')).toBeNull();
  });

  it('treats an unrelated uid as the suggester replying', () => {
    // Not reachable through the UI and denied by the rules, but the fallback has
    // to be the owner rather than the stranger, so a stray write cannot redirect
    // a notification to someone outside the thread.
    expect(replyRecipient(suggestion('owner', 'suggester'), 'stranger')).toBe('owner');
  });
});
