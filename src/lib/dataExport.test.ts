import { describe, it, expect } from 'vitest';
import { makeRecipe } from '../test/factories';
import {
  assembleDataExport,
  ANONYMOUS_NOTE,
  DATA_EXPORT_VERSION,
  type CloudInput,
  type DataExportInput,
} from './dataExport';

const ME = 'me123';
const BOB = 'bob456';
const CAL = 'cal789';

const empty: CloudInput = {
  profile: { data: null },
  recipes: { data: [] },
  favorites: { data: [] },
  follows: { data: [] },
  suggestions: { data: [] },
  notifications: { data: [] },
  termsAcceptance: { data: null },
  notificationPrefs: { data: null },
  tasteProfile: { data: null },
  writeWindows: { data: [] },
  cooks: { data: [] },
  cookPhotos: { data: [] },
  kitchen: { data: null },
  kitchenMemberships: { data: [] },
  collections: { data: [] },
};

function full(): DataExportInput {
  return {
    uid: ME,
    exportedAt: '2026-10-15T00:00:00.000Z',
    local: { recipes: [makeRecipe({ id: 'r1', title: 'Soup', createdAt: 1, updatedAt: 1 })], bookmarks: [{ uid: ME, recipeId: 'x', createdAt: 5 }] },
    cloud: {
      ...empty,
      profile: { data: { uid: ME, displayName: 'Me', photoType: 'emoji', photoEmoji: 'x', photoBgColor: null, photoURL: null, recipeCount: 1, followerCount: 1, followingCount: 1, createdAt: 1 } },
      recipes: { data: [{ id: 'r1', createdAt: 2, createdBy: { uid: ME, displayName: 'Me' }, collaborators: [{ uid: BOB, displayName: 'Bob' }], collaboratorUids: [BOB] }] },
      favorites: { data: [{ id: `${ME}_r9`, uid: ME, recipeId: 'r9', recipeOwnerId: CAL, createdAt: 3 }] },
      follows: {
        data: [
          { id: `${BOB}_${ME}`, followerId: BOB, followingId: ME, followerDisplayName: 'Bob', createdAt: 4 },
          { id: `${ME}_${CAL}`, followerId: ME, followingId: CAL, followerDisplayName: 'Me', createdAt: 3 },
        ],
      },
      suggestions: {
        data: [
          {
            id: 's1', recipeId: 'r1', recipeOwnerId: ME, recipeTitle: 'Soup', suggestedBy: { uid: BOB, displayName: 'Bob' },
            message: 'more salt', status: 'pending', createdAt: 6,
            messages: [
              { id: 'm2', fromUid: ME, fromDisplayName: 'Me', text: 'ok', createdAt: 8 },
              { id: 'm1', fromUid: BOB, fromDisplayName: 'Bob', text: 'thanks', createdAt: 7 },
            ],
          },
        ],
      },
      notifications: { data: [{ id: 'n1', recipientUid: ME, type: 'follow', fromUid: BOB, fromDisplayName: 'Bob', message: null, read: false, createdAt: 9 }] },
      termsAcceptance: { data: { id: ME, version: 'v', acceptedAt: 1 } },
      notificationPrefs: { data: { id: ME, branch: true, suggestion: true, follow: false } },
      writeWindows: { data: [{ id: `${ME}_recipe`, count: 1 }] },
      cooks: {
        data: [{ id: 'k1', uid: ME, displayName: 'Me', recipeId: 'r9', rootId: 'r9', recipeOwnerId: CAL, vote: 'again', note: 'lovely', branchId: null, createdAt: 10 }],
      },
      cookPhotos: { data: [{ id: 'k1', uid: ME, recipeId: 'r9', url: 'data:image/jpeg;base64,AAAA', createdAt: 11 }] },
    },
  };
}

describe('assembleDataExport', () => {
  it('assembles every section with version, uid and exportedAt', () => {
    const out = assembleDataExport(full());
    expect(out.version).toBe(DATA_EXPORT_VERSION);
    expect(out.uid).toBe(ME);
    expect(out.exportedAt).toBe('2026-10-15T00:00:00.000Z');
    expect(out.errors).toEqual([]);
    expect(out.local.recipes).toHaveLength(1);
    expect(out.local.bookmarks).toHaveLength(1);
    expect(out.cloud?.favorites).toHaveLength(1);
    expect(out.cloud?.follows).toHaveLength(2);
    expect(out.cloud?.suggestions[0].messages.map((m) => m.text)).toEqual(['thanks', 'ok']);
    expect(out.cloud?.termsAcceptance).not.toBeNull();
    expect(out.cloud?.notificationPrefs).toMatchObject({ follow: false });
    expect(out.cloud?.writeWindows).toHaveLength(1);
    expect(out.cloud?.cooks).toHaveLength(1);
    expect(out.cloud?.cookPhotos).toHaveLength(1);
  });

  it('exports the taste profile', () => {
    const input = full();
    input.cloud!.tasteProfile = { data: { id: ME, avoids: ['Coriander'], hidden: ['Curry'], askedAt: null } };
    expect(assembleDataExport(input).cloud?.tasteProfile).toMatchObject({ avoids: ['Coriander'], hidden: ['Curry'] });
  });

  it('exports the kitchen and collections, aliasing any other uid and dropping unknown keys', () => {
    const input = full();
    input.cloud!.kitchen = {
      data: { id: ME, ownerUid: ME, memberUids: [ME, BOB], stray: BOB, shopping: [{ id: 'a', name: 'Egg' }], pantry: [{ id: 'p', name: 'Salt', addedBy: BOB, addedAt: 1 }], updatedAt: 3 },
    };
    input.cloud!.collections = { data: [{ id: 'c1', ownerUid: ME, name: 'Dinner', visibility: 'private', recipeIds: ['r1'], createdAt: 1, updatedAt: 2, stray: 1 }] };
    const out = assembleDataExport(input).cloud!;
    expect(JSON.stringify(out.kitchen)).not.toContain(BOB);
    expect(out.kitchen).toMatchObject({ ownerUid: ME, memberUids: [ME, 'other-user-1'], shopping: [{ id: 'a', name: 'Egg' }] });
    expect((out.kitchen as unknown as { pantry: { addedBy: string }[] }).pantry[0].addedBy).toBe('other-user-1');
    expect(out.kitchen).not.toHaveProperty('stray');
    expect(out.collections).toEqual([{ id: 'c1', ownerUid: ME, name: 'Dinner', visibility: 'private', recipeIds: ['r1'], createdAt: 1, updatedAt: 2 }]);
  });

  it('summarises kitchen membership with role and member count, other members anonymised (RL-238)', () => {
    const input = full();
    input.cloud!.kitchenMemberships = {
      data: [
        { id: ME, ownerUid: ME, memberUids: [ME], shopping: [{ id: 'a', name: 'Egg' }], pantry: [] },
        { id: BOB, ownerUid: BOB, memberUids: [BOB, ME, CAL], joinCode: `${ME}:x`, shopping: [], pantry: [{ id: 'p', name: 'Salt', addedBy: CAL }] },
      ],
    };
    const out = assembleDataExport(input).cloud!;
    const json = JSON.stringify(out.kitchenMemberships);
    expect(json).not.toContain(BOB);
    expect(json).not.toContain(CAL);
    expect(json).not.toContain('Salt');
    const bob = out.kitchenMemberships.find((m) => m.role === 'member')!;
    expect(out.kitchenMemberships).toContainEqual({ kitchenId: ME, role: 'owner', memberCount: 1, memberUids: [ME] });
    expect(bob).toMatchObject({ role: 'member', memberCount: 3 });
    expect(bob.memberUids).toEqual([bob.kitchenId, ME, expect.stringMatching(/^other-user-\d+$/)]);
  });

  it('reports a failed membership read in errors', () => {
    const input = full();
    input.cloud!.kitchenMemberships = { error: 'permission-denied' };
    const out = assembleDataExport(input);
    expect(out.cloud!.kitchenMemberships).toEqual([]);
    expect(out.errors).toContainEqual({ section: 'kitchenMemberships', message: 'permission-denied' });
  });

  it("keeps the user's cooks and photos whole and aliases the recipe owner of a cook", () => {
    const input = full();
    input.cloud!.cookPhotos = { data: [{ id: 'k1', uid: ME, recipeId: 'r9', url: 'data:image/jpeg;base64,AAAA', createdAt: 11, stray: BOB }] };
    const out = assembleDataExport(input);
    expect(out.cloud!.cooks[0]).toMatchObject({ uid: ME, displayName: 'Me', note: 'lovely', recipeOwnerId: out.cloud!.favorites[0].recipeOwnerId });
    expect(out.cloud!.cooks[0].recipeOwnerId).toMatch(/^other-user-\d+$/);
    expect(out.cloud!.cookPhotos).toEqual([{ id: 'k1', uid: ME, recipeId: 'r9', url: 'data:image/jpeg;base64,AAAA', createdAt: 11 }]);
  });

  it('records a failed section in errors and carries on', () => {
    const input = full();
    input.cloud!.favorites = { error: 'permission-denied' };
    input.cloud!.notifications = { data: [], warning: 'Stopped at 5000 notifications' };
    const out = assembleDataExport(input);
    expect(out.errors).toEqual([
      { section: 'favorites', message: 'permission-denied' },
      { section: 'notifications', message: 'Stopped at 5000 notifications' },
    ]);
    expect(out.cloud?.favorites).toEqual([]);
    expect(out.cloud?.follows).toHaveLength(2);
  });

  it('gives anonymous users the local data and a note, with no cloud section', () => {
    const input = full();
    delete input.cloud;
    const out = assembleDataExport(input);
    expect(out.cloud).toBeNull();
    expect(out.note).toBe(ANONYMOUS_NOTE);
    expect(out.local.recipes).toHaveLength(1);
  });

  it('removes every other uid and display name, keeps the requester and content', () => {
    const json = JSON.stringify(assembleDataExport(full()));
    for (const other of [BOB, CAL, 'Bob']) expect(json).not.toContain(other);
    expect(json).toContain(ME);
    expect(json).toContain('more salt');
    expect(json).toContain('thanks');
    expect(json).toContain('other-user-1');
  });

  it('keeps the requester name and uses one alias per other uid, including in ids', () => {
    const out = assembleDataExport(full());
    const s = out.cloud!.suggestions[0];
    expect(s.messages.find((m) => m.fromUid === ME)?.fromDisplayName).toBe('Me');
    expect(s.suggestedBy.uid).toBe(out.cloud!.notifications[0].fromUid);
    expect(out.cloud!.follows.map((f) => f.id)).toContain(`${ME}_${out.cloud!.favorites[0].recipeOwnerId}`);
    const r = out.cloud!.recipes[0] as unknown as { collaborators: { uid: string }[]; collaboratorUids: string[] };
    expect(r.collaboratorUids).toEqual([r.collaborators[0].uid]);
  });

  it('does not mutate its input', () => {
    const input = full();
    const before = JSON.stringify(input);
    assembleDataExport(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('is deterministic whatever the row order', () => {
    const a = full();
    const b = full();
    const f = b.cloud!.follows;
    if ('data' in f) b.cloud!.follows = { data: [...f.data].reverse() };
    expect(JSON.stringify(assembleDataExport(b))).toBe(JSON.stringify(assembleDataExport(a)));
  });

  it('handles empty sections', () => {
    const out = assembleDataExport({ uid: ME, exportedAt: 'x', local: { recipes: [], bookmarks: [] }, cloud: empty });
    expect(out.errors).toEqual([]);
    expect(out.cloud?.profile).toBeNull();
    expect(out.cloud?.suggestions).toEqual([]);
  });

  it('redacts a recipe nested in a local chat history', () => {
    const input = full();
    input.local.recipes = [
      makeRecipe({
        id: 'r2',
        createdAt: 2,
        chatHistory: [
          { role: 'assistant', content: 'x', timestamp: 1, recipe: makeRecipe({ id: 'inner', createdBy: { uid: BOB, displayName: 'Bob' }, collaborators: [{ uid: CAL, displayName: 'Cal' }] }) },
        ],
      }),
    ];
    const before = JSON.stringify(input);
    const json = JSON.stringify(assembleDataExport(input));
    for (const other of [BOB, CAL, 'Bob', 'Cal']) expect(json).not.toContain(other);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('leaves out bookmarks of another account on this device and counts them', () => {
    const input = full();
    input.local.bookmarks = [
      { uid: ME, recipeId: 'a', createdAt: 1 },
      { uid: 'local', recipeId: 'b', createdAt: 2 },
      { uid: BOB, recipeId: 'c', createdAt: 3 },
    ];
    const out = assembleDataExport(input);
    expect(out.local.bookmarks.map((b) => b.recipeId)).toEqual(['a', 'b']);
    expect(out.local.bookmarksOfOtherAccountsOmitted).toBe(1);
    expect(JSON.stringify(out)).not.toContain(BOB);
  });

  it('drops fields it does not know, so they cannot carry another identity', () => {
    const input = full();
    const c = input.cloud!;
    if ('data' in c.follows) c.follows.data[0] = { ...c.follows.data[0], extraUid: BOB } as never;
    if ('data' in c.notifications) c.notifications.data[0] = { ...c.notifications.data[0], lastActor: BOB } as never;
    if ('data' in c.suggestions) c.suggestions.data[0].messages[0] = { ...c.suggestions.data[0].messages[0], replyTo: BOB } as never;
    expect(JSON.stringify(assembleDataExport(input))).not.toContain(BOB);
  });
});
