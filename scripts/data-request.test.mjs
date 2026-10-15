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
  chunkPlan,
  summarise,
  plain,
  emulatorHosts,
  resolveTarget,
  redactExport,
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
    profile: doc(`profiles/${U}`, {}), termsAcceptance: null, rateLimit: null, writeWindows: [], clientErrors: [],
    recipes: {
      owned: [doc('recipes/r1', { createdBy: { uid: U, displayName: 'T' }, collaborators: [{ uid: O, displayName: 'Omar' }] })],
      asCollaborator: [doc('recipes/r2', { createdBy: { uid: O, displayName: 'Omar' }, collaborators: [{ uid: U, displayName: 'T' }] })],
    },
    favorites: [doc(`favorites/${U}_r2`, { uid: U, recipeId: 'r2', recipeOwnerId: O })],
    follows: [doc(`follows/${O}_${U}`, { followerId: O, followingId: U, followerDisplayName: 'Omar' })],
    suggestions: [doc('suggestions/s1', { recipeOwnerId: O, suggestedBy: { uid: U, displayName: 'T' }, message: 'mine' }, {
      messages: [doc('suggestions/s1/messages/m1', { fromUid: O, fromDisplayName: 'Omar', text: 'theirs' }),
        doc('suggestions/s1/messages/m2', { fromUid: U, fromDisplayName: 'T', text: 'mine' })],
    })],
    notifications: [doc('notifications/n1', { recipientUid: U, fromUid: O, fromDisplayName: 'Omar' })],
  };
  const r = redactExport(U, body);
  it('replaces every other uid and name, in fields and paths, with one stable alias', () => {
    const json = JSON.stringify(r);
    expect(json).not.toContain(O);
    expect(json).not.toContain('Omar');
    expect(r.recipes.owned[0].data.collaborators).toEqual([{ uid: 'other-user-1', displayName: null }]);
    expect(r.recipes.asCollaborator[0].data.createdBy).toEqual({ uid: 'other-user-1', displayName: null });
    expect(r.follows[0].path).toBe(`follows/other-user-1_${U}`);
    expect(r.follows[0].data.followerDisplayName).toBeNull();
    expect(r.notifications[0].data).toMatchObject({ recipientUid: U, fromUid: 'other-user-1', fromDisplayName: null });
  });
  it('keeps the requester and all content', () => {
    expect(r.recipes.asCollaborator[0].data.collaborators).toEqual([{ uid: U, displayName: 'T' }]);
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
    rateLimit: null,
    writeWindows: [doc(`writeWindows/${U}_reply`, {})],
    ownRecipes: [doc('recipes/r1', { createdBy: { uid: U }, collaborators: [{ uid: U, displayName: 'T' }] })],
    collaboratorRecipes: [
      doc('recipes/r1', { createdBy: { uid: U }, collaborators: [{ uid: U, displayName: 'T' }] }),
      doc('recipes/r2', { createdBy: { uid: O }, collaborators: [{ uid: O, displayName: 'O' }, { uid: U, displayName: 'T' }] }),
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
    counters: {
      'recipes/r2': { favoriteCount: 3 },
      'recipes/r3': { favoriteCount: 0 },
      [`profiles/${O}`]: { followerCount: 1, followingCount: 1 },
    },
  };
  const plan = buildErasePlan(U, fetched);
  const ops = plan.groups.flatMap((g) => g.ops);
  const deletes = ops.filter((o) => o.kind === 'delete').map((o) => o.path);
  const updates = ops.filter((o) => o.kind === 'update');

  it('deletes suggestions on own recipes with their whole thread, messages first', () => {
    const g = plan.groups.find((x) => x.ops.some((o) => o.path === 'suggestions/s2'));
    expect(g.ops.map((o) => o.path)).toEqual(['suggestions/s2/messages/m3', 'suggestions/s2/messages/m4', 'suggestions/s2']);
    expect(updates.some((o) => o.path.startsWith('suggestions/s2'))).toBe(false);
  });

  it('anonymises the uid\'s suggestion and reply on another recipe, once each, and nothing of the other party', () => {
    const anon = updates.filter((o) => o.set).map((o) => [o.path, o.set]);
    expect(anon).toEqual([
      ['suggestions/s1', { 'suggestedBy.uid': PLACEHOLDER_UID, 'suggestedBy.displayName': null }],
      ['suggestions/s1/messages/m1', { fromUid: PLACEHOLDER_UID, fromDisplayName: null }],
    ]);
  });

  it('removes the uid from other recipes\' collaborators only', () => {
    const removes = updates.filter((o) => o.arrayRemove);
    expect(removes).toEqual([
      { kind: 'update', path: 'recipes/r2', arrayRemove: { field: 'collaborators', values: [{ uid: U, displayName: 'T' }] } },
    ]);
  });

  it('decrements counters with their delete, never below zero and never on deleted docs', () => {
    const fav = plan.groups.find((g) => g.ops[0].path === `favorites/${U}_r2`);
    expect(fav.ops[1]).toEqual({ kind: 'update', path: 'recipes/r2', increment: { field: 'favoriteCount', by: -1 } });
    expect(plan.groups.find((g) => g.ops[0].path === `favorites/${U}_r1`).ops).toHaveLength(1);
    expect(plan.groups.find((g) => g.ops[0].path === `favorites/${U}_r3`).ops).toHaveLength(1);
    const incs = updates.filter((o) => o.increment).map((o) => `${o.path}.${o.increment.field}`);
    expect(incs).toEqual(['recipes/r2.favoriteCount', `profiles/${O}.followerCount`, `profiles/${O}.followingCount`]);
  });

  it('deletes everything else once', () => {
    expect(deletes).toEqual(expect.arrayContaining([
      'recipes/r1', `favorites/${O}_r1`, `follows/${U}_${O}`, `follows/${O}_${U}`, 'notifications/n1', 'notifications/n2',
      'clientErrors/e1', `profiles/${U}`, `termsAcceptance/${U}`, `writeWindows/${U}_reply`,
    ]));
    expect(new Set(deletes).size).toBe(deletes.length);
    expect(plan.deleteAuthUser).toBe(true);
  });

  it('is empty for a uid with nothing', () => {
    expect(buildErasePlan(U, {})).toEqual({ groups: [], deleteAuthUser: false });
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
