import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  parseArgs,
  checkConfirmation,
  checkOutPath,
  defaultOutPath,
  buildErasePlan,
  exitCodeFor,
  chunkPlan,
  summarise,
  describeOp,
  plain,
  emulatorHosts,
  resolveTarget,
  redactExport,
  kitchenMemberships,
  kitchenErasePatch,
  REPO_ROOT,
  PLACEHOLDER_UID,
} from './data-request.mjs';

const U = 'targetUid1';
const O = 'otherUid2';
const doc = (path, data, extra = {}) => ({ path, data, ...extra });

describe('parseArgs', () => {
  it('reads the command, uid and flags', () => {
    expect(parseArgs(['erase', U, '--execute', '--confirm', U])).toMatchObject({
      command: 'erase', uid: U, execute: true, confirm: U, emulator: false,
    });
    expect(parseArgs(['export', U, '--emulator', '--out=/x/y.json'])).toMatchObject({ emulator: true, out: '/x/y.json' });
  });

  it('rejects bad input', () => {
    expect(parseArgs(['erase']).error).toBeTruthy();
    expect(parseArgs(['wipe', U]).error).toMatch(/unknown command/);
    expect(parseArgs(['erase', 'a/b']).error).toMatch(/not a valid uid/);
    expect(parseArgs(['erase', 'a_b']).error).toMatch(/not a valid uid/);
    expect(parseArgs(['erase', U, '--force']).error).toMatch(/unknown flag/);
    expect(parseArgs(['erase', U, '--confirm']).error).toMatch(/needs a value/);
    expect(parseArgs(['export', U, '--execute']).error).toBeTruthy();
  });
});

describe('checkConfirmation', () => {
  const erase = (o) => ({ command: 'erase', uid: U, emulator: false, execute: true, confirm: null, ...o });
  it('refuses a production execute without the uid typed twice', () => {
    expect(checkConfirmation(erase())).toMatch(/PRODUCTION/);
    expect(checkConfirmation(erase({ confirm: O }))).toMatch(/PRODUCTION/);
  });
  it('allows a dry run, the emulator, and a confirmed production run', () => {
    expect(checkConfirmation(erase({ execute: false }))).toBeNull();
    expect(checkConfirmation(erase({ emulator: true }))).toBeNull();
    expect(checkConfirmation(erase({ confirm: U }))).toBeNull();
  });

  it('refuses from the CLI before Firebase is touched', () => {
    let status = 0;
    let stderr = '';
    let stdout = '';
    try {
      // Unreachable emulator hosts and no credentials: if the refusal came after
      // initialisation this would hang or fail differently.
      execFileSync('node', [join(REPO_ROOT, 'scripts/data-request.mjs'), 'erase', U, '--execute'], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { PATH: process.env.PATH, GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent.json' },
        timeout: 10000,
      });
    } catch (err) {
      status = err.status;
      stderr = err.stderr;
      stdout = err.stdout;
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/refusing to erase in PRODUCTION/);
    expect(stdout).toBe(''); // the "on project ..." line is printed only after the checks
  });
});

describe('checkOutPath', () => {
  it('refuses the repo and anything inside it', () => {
    expect(checkOutPath(REPO_ROOT)).toBeTruthy();
    expect(checkOutPath(join(REPO_ROOT, 'export.json'))).toBeTruthy();
    expect(checkOutPath(join(REPO_ROOT, 'backlog/x.json'))).toBeTruthy();
  });
  it('compares the repo case-insensitively and refuses missing dirs and existing files', () => {
    expect(checkOutPath(join(REPO_ROOT.toLowerCase(), 'export.json'))).toBeTruthy();
    expect(checkOutPath(join(tmpdir(), 'no-such-dir-rl055', 'x.json'))).toMatch(/does not exist/);
    const dir = mkdtempSync(join(tmpdir(), 'rl055-'));
    writeFileSync(join(dir, 'old.json'), '{}');
    expect(checkOutPath(join(dir, 'old.json'))).toMatch(/overwrite/);
    expect(checkOutPath(join(dir, 'new.json'))).toBeNull();
  });
  it('allows the default under the temp dir', () => {
    expect(checkOutPath(defaultOutPath(U))).toBeNull();
    expect(defaultOutPath(U).startsWith(tmpdir())).toBe(true);
  });
});

describe('emulatorHosts', () => {
  it('reads the ports from firebase.json', () => {
    expect(emulatorHosts()).toEqual({
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    });
  });
});

describe('resolveTarget', () => {
  const hosts = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
  it('overwrites stale or empty emulator variables with loopback hosts under --emulator', () => {
    const env = { FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: 'example.com:9099' };
    expect(resolveTarget({ emulator: true }, env, hosts)).toEqual({ env: hosts });
  });
  it('refuses non-loopback emulator hosts', () => {
    expect(resolveTarget({ emulator: true }, {}, { ...hosts, FIRESTORE_EMULATOR_HOST: '10.0.0.5:8080' }).error).toMatch(/loopback/);
  });
  it('refuses a production run while either variable is set, even empty', () => {
    expect(resolveTarget({ emulator: false }, { FIRESTORE_EMULATOR_HOST: '' }, hosts).error).toMatch(/FIRESTORE_EMULATOR_HOST/);
    expect(resolveTarget({ emulator: false }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, hosts).error).toMatch(/AUTH/);
    expect(resolveTarget({ emulator: false }, {}, hosts)).toEqual({ env: {} });
  });
  it('refuses from the CLI before Firebase is touched', () => {
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', [join(REPO_ROOT, 'scripts/data-request.mjs'), 'erase', U, '--execute', '--confirm', U], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: { PATH: process.env.PATH, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
        timeout: 10000,
      });
    } catch (err) {
      status = err.status;
      stderr = err.stderr;
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/refusing a production run with FIRESTORE_EMULATOR_HOST set/);
  });
});

describe('redactExport', () => {
  const body = {
    profile: doc(`profiles/${U}`, {}), termsAcceptance: null, notificationPrefs: doc(`notificationPrefs/${U}`, { follow: false }), tasteProfile: doc(`tasteProfiles/${U}`, { avoids: ['Coriander'] }), rateLimit: null, writeWindows: [], clientErrors: [],
    recipes: {
      owned: [doc('recipes/r1', { createdBy: { uid: U, displayName: 'T' }, collaborators: [{ uid: O, displayName: 'Omar' }], collaboratorUids: [O] })],
      asCollaborator: [doc('recipes/r2', { createdBy: { uid: O, displayName: 'Omar' }, collaborators: [{ uid: U, displayName: 'T' }], collaboratorUids: [U] })],
    },
    favorites: [doc(`favorites/${U}_r2`, { uid: U, recipeId: 'r2', recipeOwnerId: O })],
    follows: [doc(`follows/${O}_${U}`, { followerId: O, followingId: U, followerDisplayName: 'Omar' })],
    suggestions: [doc('suggestions/s1', { recipeOwnerId: O, suggestedBy: { uid: U, displayName: 'T' }, message: 'mine' }, {
      messages: [doc('suggestions/s1/messages/m1', { fromUid: O, fromDisplayName: 'Omar', text: 'theirs' }),
        doc('suggestions/s1/messages/m2', { fromUid: U, fromDisplayName: 'T', text: 'mine' })],
    })],
    notifications: [doc('notifications/n1', { recipientUid: U, fromUid: O, fromDisplayName: 'Omar' })],
    cooks: [doc('cooks/k1', { uid: U, displayName: 'T', recipeId: 'r2', recipeOwnerId: O, note: 'good' })],
    cookPhotos: [doc('cookPhotos/k1', { uid: U, recipeId: 'r2', url: 'data:image/jpeg;base64,AAAA' })],
    kitchen: doc(`kitchens/${U}`, { ownerUid: U, memberUids: [U, O], joinCode: `${O}:abc`, shopping: [], pantry: [{ id: 'p', name: 'Salt', addedBy: O, addedAt: 1 }] }),
    kitchenMemberships: kitchenMemberships(U, [
      doc(`kitchens/${U}`, { ownerUid: U, memberUids: [U, O] }),
      doc(`kitchens/${O}`, { ownerUid: O, memberUids: [O, U, 'cal'] }),
    ]),
    kitchenInvites: [doc('kitchenInvites/code1', { kitchenId: U, ownerUid: U, ownerName: 'T' })],
    collections: [doc('collections/c1', { ownerUid: U, name: 'Dinner', recipeIds: ['r1'] })],
    cookbookFollows: [doc(`cookbookFollows/${U}_c9`, { uid: U, collectionId: 'c9' })],
  };
  const r = redactExport(U, body);
  it('replaces every other uid and name, in fields and paths, with one stable alias', () => {
    const json = JSON.stringify(r);
    expect(json).not.toContain(O);
    expect(json).not.toContain('Omar');
    expect(r.recipes.owned[0].data.collaborators).toEqual([{ uid: 'other-user-1', displayName: null }]);
    expect(r.recipes.owned[0].data.collaboratorUids).toEqual(['other-user-1']);
    expect(r.recipes.asCollaborator[0].data.createdBy).toEqual({ uid: 'other-user-1', displayName: null });
    expect(r.follows[0].path).toBe(`follows/other-user-1_${U}`);
    expect(r.follows[0].data.followerDisplayName).toBeNull();
    expect(r.notifications[0].data).toMatchObject({ recipientUid: U, fromUid: 'other-user-1', fromDisplayName: null });
    expect(r.cooks[0].data).toEqual({ uid: U, displayName: 'T', recipeId: 'r2', recipeOwnerId: 'other-user-1', note: 'good' });
  });
  it('keeps the taste profile in the export', () => {
    expect(r.tasteProfile).toEqual(body.tasteProfile);
  });
  it('aliases other members of the kitchen and keeps the collections whole', () => {
    expect(r.kitchen.data).toMatchObject({ ownerUid: U, memberUids: [U, 'other-user-1'] });
    expect(r.kitchen.data.pantry[0].addedBy).toBe('other-user-1');
    expect(r.kitchen.data).not.toHaveProperty('joinCode');
    expect(r.collections).toEqual(body.collections);
    expect(r.cookbookFollows).toEqual(body.cookbookFollows);
  });
  it('summarises kitchen membership with role and member count, other members aliased (RL-238)', () => {
    expect(r.kitchenMemberships).toEqual([
      { kitchenId: U, role: 'owner', memberCount: 2, memberUids: [U, 'other-user-1'] },
      { kitchenId: 'other-user-1', role: 'member', memberCount: 3, memberUids: ['other-user-1', U, 'other-user-2'] },
    ]);
    expect(JSON.stringify(r)).not.toContain('"cal"');
    expect(r.kitchenInvites[0].data.kitchenId).toBe(U);
  });
  it('keeps the cook photo whole', () => {
    expect(r.cookPhotos).toEqual(body.cookPhotos);
  });
  it('keeps the requester and all content', () => {
    expect(r.recipes.asCollaborator[0].data.collaborators).toEqual([{ uid: U, displayName: 'T' }]);
    expect(r.recipes.asCollaborator[0].data.collaboratorUids).toEqual([U]);
    expect(r.suggestions[0].data.suggestedBy).toEqual({ uid: U, displayName: 'T' });
    expect(r.suggestions[0].messages.map((m) => [m.data.fromUid, m.data.fromDisplayName, m.data.text])).toEqual([
      ['other-user-1', null, 'theirs'], [U, 'T', 'mine'],
    ]);
    expect(body.follows[0].path).toBe(`follows/${O}_${U}`); // input untouched
  });
});

describe('plain', () => {
  it('turns timestamps into ISO strings, deeply', () => {
    const ts = { toDate: () => new Date(0) };
    expect(plain({ a: [ts], b: { c: ts }, d: null })).toEqual({
      a: ['1970-01-01T00:00:00.000Z'], b: { c: '1970-01-01T00:00:00.000Z' }, d: null,
    });
  });
});

describe('buildErasePlan', () => {
  const fetched = {
    authUser: { uid: U },
    profile: doc(`profiles/${U}`, {}),
    termsAcceptance: doc(`termsAcceptance/${U}`, {}),
    notificationPrefs: doc(`notificationPrefs/${U}`, {}),
    tasteProfile: doc(`tasteProfiles/${U}`, {}),
    rateLimit: null,
    writeWindows: [doc(`writeWindows/${U}_reply`, {}), doc(`writeWindows/${U}_cookbook`, {})],
    ownRecipes: [doc('recipes/r1', { createdBy: { uid: U }, collaborators: [{ uid: U, displayName: 'T' }] })],
    collaboratorRecipes: [
      doc('recipes/r1', { createdBy: { uid: U }, collaborators: [{ uid: U, displayName: 'T' }] }),
      doc('recipes/r2', { createdBy: { uid: O }, collaborators: [{ uid: O, displayName: 'O' }, { uid: U, displayName: 'T' }], collaboratorUids: [O, U] }),
      // Legacy credit: no uid list, so none is named (arrayRemove would create the field).
      doc('recipes/r4', { createdBy: { uid: O }, collaborators: [{ uid: U, displayName: 'T' }] }),
      // Only the uid list holds the uid.
      doc('recipes/r5', { createdBy: { uid: O }, collaborators: [], collaboratorUids: [U] }),
    ],
    favorites: [
      doc(`favorites/${U}_r2`, { uid: U, recipeId: 'r2' }),
      doc(`favorites/${U}_r1`, { uid: U, recipeId: 'r1' }),
      doc(`favorites/${U}_r3`, { uid: U, recipeId: 'r3' }),
    ],
    favoritesOfOwnRecipes: [doc(`favorites/${O}_r1`, { uid: O, recipeId: 'r1', recipeOwnerId: U })],
    follows: [
      doc(`follows/${U}_${O}`, { followerId: U, followingId: O }),
      doc(`follows/${O}_${U}`, { followerId: O, followingId: U }),
      doc(`follows/${O}_${U}`, { followerId: O, followingId: U }),
    ],
    suggestionsAuthored: [
      doc('suggestions/s1', { recipeOwnerId: O, suggestedBy: { uid: U, displayName: 'T' } }, {
        messages: [
          doc('suggestions/s1/messages/m1', { fromUid: U }),
          doc('suggestions/s1/messages/m2', { fromUid: O }),
        ],
      }),
    ],
    suggestionsOnOwn: [
      doc('suggestions/s2', { recipeOwnerId: U, suggestedBy: { uid: O, displayName: 'O' } }, {
        messages: [doc('suggestions/s2/messages/m3', { fromUid: O }), doc('suggestions/s2/messages/m4', { fromUid: U })],
      }),
    ],
    strayMessages: [doc('suggestions/s1/messages/m1', { fromUid: U }), doc('suggestions/s2/messages/m4', { fromUid: U })],
    notifications: [doc('notifications/n1', {}), doc('notifications/n1', {}), doc('notifications/n2', {})],
    clientErrors: [doc('clientErrors/e1', { uid: U })],
    cooks: [doc('cooks/k1', { uid: U, recipeId: 'r2', recipeOwnerId: O }), doc('cooks/k2', { uid: U, recipeId: 'r1', recipeOwnerId: U })],
    cookPhotos: [doc('cookPhotos/k1', { uid: U, recipeId: 'r2', url: 'data:image/jpeg;base64,AAAA' })],
    cooksOnOwn: [doc('cooks/k3', { uid: O, recipeId: 'r1', recipeOwnerId: U })],
    kitchen: doc(`kitchens/${U}`, { ownerUid: U, memberUids: [U] }),
    collections: [doc('collections/c1', { ownerUid: U })],
    cookbookFollows: [
      doc(`cookbookFollows/${U}_cb1`, { uid: U, collectionId: 'cb1' }),
      doc(`cookbookFollows/${U}_cb0`, { uid: U, collectionId: 'cb0' }),
      doc(`cookbookFollows/${U}_gone`, { uid: U, collectionId: 'gone' }),
      doc(`cookbookFollows/${U}_c1`, { uid: U, collectionId: 'c1' }),
    ],
    counters: {
      'collections/cb1': { followerCount: 4 },
      'collections/cb0': { followerCount: 0 },
      'collections/c1': { followerCount: 1 },
      'recipes/r2': { favoriteCount: 3 },
      'recipes/r3': { favoriteCount: 0 },
      [`profiles/${O}`]: { followerCount: 1, followingCount: 1 },
    },
  };
  const plan = buildErasePlan(U, fetched);
  const ops = plan.groups.flatMap((g) => g.ops);
  const deletes = ops.filter((o) => o.kind === 'delete').map((o) => o.path);
  const updates = ops.filter((o) => o.kind === 'update');

  it('keeps another user\'s suggestion on an own recipe and anonymises only the owner side', () => {
    const g = plan.groups.find((x) => x.ops.some((o) => o.path === 'suggestions/s2'));
    expect(g.ops).toEqual([
      { kind: 'update', path: 'suggestions/s2/messages/m4', set: { fromUid: PLACEHOLDER_UID, fromDisplayName: null } },
      { kind: 'update', path: 'suggestions/s2', set: { recipeOwnerId: PLACEHOLDER_UID } },
    ]);
    expect(deletes.some((p) => p.startsWith('suggestions/s2'))).toBe(false);
  });

  it('puts the parent patch last in a kept-thread group, so it is the commit point', () => {
    for (const parent of ['suggestions/s1', 'suggestions/s2']) {
      const g = plan.groups.find((x) => x.ops.some((o) => o.path === parent));
      expect(g.ops.length).toBeGreaterThan(1);
      expect(g.ops[g.ops.length - 1].path).toBe(parent);
    }
  });

  it('leaves the other party\'s replies in a kept thread untouched', () => {
    expect(ops.some((o) => o.path === 'suggestions/s2/messages/m3')).toBe(false);
  });

  it('deletes a self-suggestion with its whole thread, messages first', () => {
    const self = doc('suggestions/s5', { recipeOwnerId: U, suggestedBy: { uid: U, displayName: 'T' } }, {
      messages: [doc('suggestions/s5/messages/m7', { fromUid: U }), doc('suggestions/s5/messages/m8', { fromUid: U })],
    });
    const p = buildErasePlan(U, { suggestionsAuthored: [self], suggestionsOnOwn: [self] });
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].ops.map((o) => `${o.kind} ${o.path}`)).toEqual([
      'delete suggestions/s5/messages/m7', 'delete suggestions/s5/messages/m8', 'delete suggestions/s5',
    ]);
  });

  it('anonymises the uid\'s suggestion and reply on another recipe, once each, and nothing of the other party', () => {
    const anon = updates.filter((o) => o.set && o.path.startsWith('suggestions/') && !o.path.startsWith('suggestions/s2')).map((o) => [o.path, o.set]);
    expect(anon).toEqual([
      ['suggestions/s1/messages/m1', { fromUid: PLACEHOLDER_UID, fromDisplayName: null }],
      ['suggestions/s1', { 'suggestedBy.uid': PLACEHOLDER_UID, 'suggestedBy.displayName': null }],
    ]);
  });

  it('removes the uid from other recipes\' collaborators only', () => {
    const removes = updates.filter((o) => o.arrayRemove);
    expect(removes).toEqual([
      { kind: 'update', path: 'recipes/r2', arrayRemove: { collaborators: [{ uid: U, displayName: 'T' }], collaboratorUids: [U] } },
      { kind: 'update', path: 'recipes/r4', arrayRemove: { collaborators: [{ uid: U, displayName: 'T' }] } },
      { kind: 'update', path: 'recipes/r5', arrayRemove: { collaboratorUids: [U] } },
    ]);
    expect(describeOp(removes[0])).toBe(
      `UPDATE recipes/r2 collaborators remove [{"uid":"${U}","displayName":"T"}], collaboratorUids remove ["${U}"]`,
    );
  });

  it('decrements counters with their delete, never below zero and never on deleted docs', () => {
    const fav = plan.groups.find((g) => g.ops[0].path === `favorites/${U}_r2`);
    expect(fav.ops[1]).toEqual({ kind: 'update', path: 'recipes/r2', increment: { field: 'favoriteCount', by: -1 } });
    expect(plan.groups.find((g) => g.ops[0].path === `favorites/${U}_r1`).ops).toHaveLength(1);
    expect(plan.groups.find((g) => g.ops[0].path === `favorites/${U}_r3`).ops).toHaveLength(1);
    const incs = updates.filter((o) => o.increment).map((o) => `${o.path}.${o.increment.field}`);
    expect(incs).toEqual(['recipes/r2.favoriteCount', `profiles/${O}.followerCount`, `profiles/${O}.followingCount`, 'collections/cb1.followerCount']);
  });

  it('deletes everything else once', () => {
    expect(deletes).toEqual(expect.arrayContaining([
      'recipes/r1', `favorites/${O}_r1`, `follows/${U}_${O}`, `follows/${O}_${U}`, 'notifications/n1', 'notifications/n2',
      'clientErrors/e1', `profiles/${U}`, `termsAcceptance/${U}`, `notificationPrefs/${U}`, `tasteProfiles/${U}`, `writeWindows/${U}_reply`, `writeWindows/${U}_cookbook`,
    ]));
    expect(new Set(deletes).size).toBe(deletes.length);
    expect(plan.deleteAuthUser).toBe(true);
  });

  it('deletes an own sole-member kitchen and its collections', () => {
    expect(deletes).toEqual(expect.arrayContaining([`kitchens/${U}`, 'collections/c1']));
    expect(plan.skipped).toEqual([]);
  });

  it('deletes cookbook follows and decrements only existing, non-zero, not-own cookbooks (RL-260)', () => {
    expect(deletes).toEqual(expect.arrayContaining([`cookbookFollows/${U}_cb1`, `cookbookFollows/${U}_cb0`, `cookbookFollows/${U}_gone`, `cookbookFollows/${U}_c1`]));
    const g = plan.groups.find((x) => x.ops[0].path === `cookbookFollows/${U}_cb1`);
    expect(g.ops[1]).toEqual({ kind: 'update', path: 'collections/cb1', increment: { field: 'followerCount', by: -1 } });
    for (const id of ['cb0', 'gone', 'c1']) expect(plan.groups.find((x) => x.ops[0].path === `cookbookFollows/${U}_${id}`).ops).toHaveLength(1);
  });

  describe('shared kitchens (RL-238)', () => {
    const pantry = [{ id: 'p1', name: 'Salt', addedBy: U, addedAt: 1 }, { id: 'p2', name: 'Rice', addedBy: O, addedAt: 2 }];
    const anonPantry = [{ ...pantry[0], addedBy: PLACEHOLDER_UID }, pantry[1]];

    it('passes an owned shared kitchen to the longest-standing member and removes the uid', () => {
      const k = doc(`kitchens/${U}`, { ownerUid: U, memberUids: [U, O, 'cal'], pantry });
      const p = buildErasePlan(U, { kitchen: k, kitchenMemberships: [k] });
      expect(p.groups).toHaveLength(1);
      expect(p.groups[0].label).toBe('shared kitchen passed to its longest-standing member (2 other members affected)');
      expect(p.groups[0].ops).toEqual([{
        kind: 'update', path: `kitchens/${U}`, set: { ownerUid: O, pantry: anonPantry }, arrayRemove: { memberUids: [U] }, shown: `kitchens/${U}`,
        note: 'ownerUid set to the longest-standing member, addedBy anonymised on 1 pantry item, memberUids remove the uid',
      }]);
      expect(describeOp(p.groups[0].ops[0])).not.toContain(O);
      expect(p.skipped).toEqual([]);
      expect(exitCodeFor(p)).toBe(0);
    });

    it('removes the uid from a kitchen it belongs to, anonymises its pantry items, and never prints the owner', () => {
      const k = doc(`kitchens/${O}`, { ownerUid: O, memberUids: [O, U], pantry });
      const p = buildErasePlan(U, { kitchenMemberships: [k] });
      expect(p.groups.map((g) => g.label)).toEqual(['left a shared kitchen (1 other member affected)']);
      const op = p.groups[0].ops[0];
      expect(op).toMatchObject({ path: `kitchens/${O}`, set: { pantry: anonPantry }, arrayRemove: { memberUids: [U] } });
      expect(op.set.ownerUid).toBeUndefined();
      expect(describeOp(op)).toBe('UPDATE kitchens/<another owner> addedBy anonymised on 1 pantry item, memberUids remove the uid');
      expect(JSON.stringify(summarise(p))).not.toContain(O);
    });

    it('deletes the uid\'s invites', () => {
      const p = buildErasePlan(U, { kitchenInvites: [doc('kitchenInvites/c1', { ownerUid: U, kitchenId: U })] });
      expect(p.groups).toEqual([{ label: 'own kitchen invite', ops: [{ kind: 'delete', path: 'kitchenInvites/c1' }] }]);
    });

    it('finds nothing left on a re-run after ownership passed on', () => {
      const k = doc(`kitchens/${U}`, { ownerUid: O, memberUids: [O, 'cal'], pantry: anonPantry });
      const p = buildErasePlan(U, { kitchen: k });
      expect(p.groups).toEqual([]);
      expect(p.skipped).toEqual([]);
    });

    it('anonymises pantry items left in a kitchen the uid no longer belongs to', () => {
      const p = buildErasePlan(U, { kitchen: doc(`kitchens/${U}`, { ownerUid: O, memberUids: [O], pantry }) });
      expect(p.groups[0].ops[0]).toMatchObject({ set: { pantry: anonPantry } });
      expect(p.groups[0].ops[0].arrayRemove).toBeUndefined();
    });

    it('skips, reports and exits 3 only for a kitchen it cannot read the members of', () => {
      const p = buildErasePlan(U, { kitchen: doc(`kitchens/${U}`, { ownerUid: U, memberUids: 'broken' }) });
      expect(p.groups).toEqual([]);
      expect(p.skipped).toHaveLength(1);
      expect(exitCodeFor(p)).toBe(3);
      expect(exitCodeFor(plan)).toBe(0);
    });

    it('deletes a joinCode the uid left, and leaves another joiner\'s', () => {
      const mine = kitchenErasePatch(U, doc(`kitchens/${O}`, { ownerUid: O, memberUids: [O, U], joinCode: `${U}:abc` }), null);
      expect(mine).toMatchObject({ deleteFields: ['joinCode'], arrayRemove: { memberUids: [U] } });
      expect(mine.note).toBe('memberUids remove the uid, joinCode removed');
      const theirs = kitchenErasePatch(U, doc(`kitchens/${O}`, { ownerUid: O, memberUids: [O, U], joinCode: `${O}x:abc` }), null);
      expect(theirs.deleteFields).toBeUndefined();
    });

    it('kitchenErasePatch is null when there is nothing to change', () => {
      expect(kitchenErasePatch(U, doc(`kitchens/${O}`, { ownerUid: O, memberUids: [O], pantry: [] }), null)).toBeNull();
    });
  });
  it('deletes the uid\'s cook photos before its cooks and anonymises other cooks of own recipes', () => {
    const paths = ops.map((o) => o.path);
    expect(paths.indexOf('cookPhotos/k1')).toBeLessThan(Math.min(paths.indexOf('cooks/k1'), paths.indexOf('cooks/k2')));
    expect(deletes).toEqual(expect.arrayContaining(['cookPhotos/k1', 'cooks/k1', 'cooks/k2']));
    expect(updates.filter((o) => o.path === 'cooks/k3')).toEqual([{ kind: 'update', path: 'cooks/k3', set: { recipeOwnerId: PLACEHOLDER_UID } }]);
    expect(deletes).not.toContain('cooks/k3');
    expect(summarise(plan)).toMatchObject({ 'own cook photo': 1, 'own cook': 2, "another user's cook of an own recipe (kept, owner anonymised)": 1 });
  });

  it('never prints a photo\'s data URL in the dry-run lines', () => {
    expect(ops.map(describeOp).join('\n')).not.toContain('base64');
  });

  it('is empty for a uid with nothing', () => {
    expect(buildErasePlan(U, {})).toEqual({ groups: [], skipped: [], deleteAuthUser: false });
  });

  it('counts per label', () => {
    expect(summarise(plan)['notification (to or from)']).toBe(2);
  });
});

describe('chunkPlan', () => {
  const g = (n, tag) => ({ label: tag, ops: Array.from({ length: n }, (_, i) => ({ kind: 'delete', path: `${tag}/${i}` })) });
  it('caps batches and keeps groups whole when they fit', () => {
    const batches = chunkPlan([g(3, 'a'), g(2, 'b'), g(2, 'c')], 4);
    expect(batches.map((b) => b.map((o) => o.path))).toEqual([['a/0', 'a/1', 'a/2'], ['b/0', 'b/1', 'c/0', 'c/1']]);
  });
  it('splits a group bigger than a batch, in order', () => {
    const batches = chunkPlan([g(900, 'x')]);
    expect(batches.map((b) => b.length)).toEqual([400, 400, 100]);
    expect(batches[2][99].path).toBe('x/899');
  });
});
