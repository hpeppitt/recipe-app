#!/usr/bin/env node
// Operator tool for one person's data request (RL-055). Runbook: docs/operations.md,
// "Data requests". Uses the Firebase Admin SDK, which bypasses the security rules.
//
//   node scripts/data-request.mjs export <uid> [--emulator] [--out <file>] [--project <id>]
//   node scripts/data-request.mjs erase  <uid> [--emulator]                 dry run, changes nothing
//   node scripts/data-request.mjs erase  <uid> --emulator --execute         erase in the emulator
//   node scripts/data-request.mjs erase  <uid> --execute --confirm <uid>    erase in production
//
// Credentials: application default credentials (`gcloud auth application-default login`)
// or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key kept outside the repo.
//
// Everything that decides what happens is a pure function exported below and tested in
// data-request.test.mjs without Firebase. main() fetches, calls them, and writes.

import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, basename, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..');

/** Replaces the uid on suggestions and replies kept for the other party. */
export const PLACEHOLDER_UID = 'deleted-user';
/** Firestore allows 500 writes per batch; 400 leaves headroom. */
export const BATCH_LIMIT = 400;

const USAGE = `usage:
  node scripts/data-request.mjs export <uid> [--emulator] [--out <file>] [--project <id>]
  node scripts/data-request.mjs erase <uid> [--emulator] [--execute] [--confirm <uid>] [--project <id>]`;

// --- Pure logic -------------------------------------------------------------

/** Parses argv (without node and the script). Returns { error } or the options. */
export function parseArgs(argv) {
  const opts = { command: null, uid: null, emulator: false, execute: false, confirm: null, out: null, project: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.match(/^--(confirm|out|project)=(.*)$/);
    if (eq) opts[eq[1]] = eq[2];
    else if (a === '--confirm' || a === '--out' || a === '--project') {
      if (argv[i + 1] === undefined) return { error: `${a} needs a value` };
      opts[a.slice(2)] = argv[++i];
    } else if (a === '--emulator') opts.emulator = true;
    else if (a === '--execute') opts.execute = true;
    else if (a.startsWith('--')) return { error: `unknown flag ${a}` };
    else positional.push(a);
  }
  if (positional.length !== 2) return { error: 'expected a command and one uid' };
  [opts.command, opts.uid] = positional;
  if (!['export', 'erase'].includes(opts.command)) return { error: `unknown command ${opts.command}` };
  // Firebase uids are alphanumeric. Refusing anything else also rules out a path
  // separator or the `_` that writeWindows ids are split on.
  if (!/^[A-Za-z0-9]{1,128}$/.test(opts.uid)) return { error: `not a valid uid: ${opts.uid}` };
  if (opts.command === 'export' && (opts.execute || opts.confirm)) return { error: '--execute and --confirm apply to erase only' };
  if (opts.command === 'erase' && opts.out) return { error: '--out applies to export only' };
  return opts;
}

/**
 * The typed confirmation. Returns an error message, or null when the run may go ahead.
 * Called before Firebase is initialised, so a refusal makes no network call at all.
 */
export function checkConfirmation(opts) {
  if (opts.command !== 'erase' || !opts.execute || opts.emulator) return null;
  if (opts.confirm !== opts.uid) {
    return `refusing to erase in PRODUCTION without the uid typed twice: add --confirm ${opts.uid}`;
  }
  return null;
}

/**
 * Returns an error when the export path is inside the repository, its directory does not
 * exist, or the file already exists. The directory is resolved through symlinks and
 * compared case-insensitively, because macOS reaches one folder as both ~/Projects and
 * ~/projects.
 */
export function checkOutPath(outPath, repoRoot = REPO_ROOT) {
  const full = resolve(outPath);
  let dir;
  try {
    dir = realpathSync(dirname(full));
  } catch {
    return `export directory does not exist: ${dirname(full)}`;
  }
  const rel = relative(realpathSync(repoRoot).toLowerCase(), join(dir, basename(full)).toLowerCase());
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return `refusing to write personal data inside the repository: ${full}`;
  }
  if (existsSync(full)) return `refusing to overwrite an existing file: ${full}`;
  return null;
}

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const EMULATOR_VARS = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'];

/**
 * Decides where the run goes from --emulator and the environment, before Firebase loads.
 * With --emulator both host variables are overwritten with loopback hosts, so a stale or
 * empty value cannot send an unconfirmed erase to production. Without it, either variable
 * being set is refused: Firestore would follow it while Auth and the label said production.
 * Returns { error } or { env } (the variables to set).
 */
export function resolveTarget(opts, env, hosts) {
  if (!opts.emulator) {
    const set = EMULATOR_VARS.filter((k) => env[k] !== undefined);
    if (set.length) return { error: `refusing a production run with ${set.join(' and ')} set; unset it, or add --emulator` };
    return { env: {} };
  }
  for (const k of EMULATOR_VARS) {
    if (!LOOPBACK.test(hosts[k] ?? '')) return { error: `${k} would be ${hosts[k]}, which is not a loopback host` };
  }
  return { env: Object.fromEntries(EMULATOR_VARS.map((k) => [k, hosts[k]])) };
}

export function defaultOutPath(uid, now = new Date()) {
  return join(tmpdir(), `recipe-lab-export-${uid}-${now.toISOString().replace(/[:.]/g, '-')}.json`);
}

/** What stays on a suggestion the uid wrote on someone else's recipe. */
export function anonymisedSuggestionPatch() {
  return { 'suggestedBy.uid': PLACEHOLDER_UID, 'suggestedBy.displayName': null };
}

/** What stays on a reply the uid wrote in a thread that is kept. */
export function anonymisedMessagePatch() {
  return { fromUid: PLACEHOLDER_UID, fromDisplayName: null };
}

const parentOf = (messagePath) => messagePath.split('/').slice(0, 2).join('/');
const uniqueByPath = (docs) => [...new Map(docs.map((d) => [d.path, d])).values()];

/**
 * Builds the erase plan from fetched documents. Every doc is { path, data } with plain
 * data. `fetched` is what collect() returns. The plan is a list of groups; a group's ops
 * go in one batch when they fit, so a deleted follow and its counter decrement land
 * together and a re-run after a failure does not decrement twice.
 *
 * Ops: { kind: 'delete', path } or { kind: 'update', path, set?, arrayRemove?, increment? }.
 */
export function buildErasePlan(uid, fetched) {
  const groups = [];
  const add = (label, ops) => ops.length && groups.push({ label, ops });
  const del = (path) => ({ kind: 'delete', path });
  const counterAbove0 = (path, field) => (fetched.counters?.[path]?.[field] ?? 0) > 0;

  // Suggestions on the uid's own recipes go with the recipes, other party's text and
  // replies included. recipeOwnerId is checked against the recipe on create, so it is
  // the reliable owner field. Messages are deleted before their parent so a failed run
  // leaves no orphaned thread that only the parent could have led back to.
  const suggestions = uniqueByPath([...(fetched.suggestionsAuthored ?? []), ...(fetched.suggestionsOnOwn ?? [])]);
  const deletedThreads = new Set();
  for (const s of suggestions) {
    if (s.data.recipeOwnerId === uid) {
      deletedThreads.add(s.path);
      add('suggestion on own recipe (deleted with its thread)', [...(s.messages ?? []).map((m) => del(m.path)), del(s.path)]);
    }
  }
  for (const s of suggestions) {
    if (deletedThreads.has(s.path)) continue;
    add('suggestion on another recipe (anonymised)', [{ kind: 'update', path: s.path, set: anonymisedSuggestionPatch() }]);
  }

  // Replies by the uid in kept threads: from the threads fetched above, plus any the
  // collection-group query found elsewhere.
  const messages = uniqueByPath([
    ...suggestions.flatMap((s) => s.messages ?? []),
    ...(fetched.strayMessages ?? []),
  ]);
  for (const m of messages) {
    if (m.data.fromUid !== uid || deletedThreads.has(parentOf(m.path))) continue;
    add('reply in a kept thread (anonymised)', [{ kind: 'update', path: m.path, set: anonymisedMessagePatch() }]);
  }

  const ownRecipes = new Set((fetched.ownRecipes ?? []).map((r) => r.path));
  for (const r of fetched.ownRecipes ?? []) add('own recipe', [del(r.path)]);
  for (const r of fetched.collaboratorRecipes ?? []) {
    if (ownRecipes.has(r.path)) continue;
    const values = (r.data.collaborators ?? []).filter((c) => c?.uid === uid);
    if (values.length) add('collaborator entry removed', [{ kind: 'update', path: r.path, arrayRemove: { field: 'collaborators', values } }]);
  }

  for (const f of fetched.favorites ?? []) {
    const recipe = `recipes/${f.data.recipeId}`;
    const ops = [del(f.path)];
    if (!ownRecipes.has(recipe) && counterAbove0(recipe, 'favoriteCount')) {
      ops.push({ kind: 'update', path: recipe, increment: { field: 'favoriteCount', by: -1 } });
    }
    add('own favourite', ops);
  }
  for (const f of fetched.favoritesOfOwnRecipes ?? []) {
    if (f.data.uid !== uid) add("another user's favourite of a deleted recipe", [del(f.path)]);
  }

  for (const f of uniqueByPath(fetched.follows ?? [])) {
    const ops = [del(f.path)];
    const { followerId, followingId } = f.data;
    if (followerId === uid && followingId !== uid && counterAbove0(`profiles/${followingId}`, 'followerCount')) {
      ops.push({ kind: 'update', path: `profiles/${followingId}`, increment: { field: 'followerCount', by: -1 } });
    }
    if (followingId === uid && followerId !== uid && counterAbove0(`profiles/${followerId}`, 'followingCount')) {
      ops.push({ kind: 'update', path: `profiles/${followerId}`, increment: { field: 'followingCount', by: -1 } });
    }
    add('follow (either side)', ops);
  }

  for (const n of uniqueByPath(fetched.notifications ?? [])) add('notification (to or from)', [del(n.path)]);
  for (const e of fetched.clientErrors ?? []) add('error report', [del(e.path)]);
  for (const key of ['profile', 'termsAcceptance', 'rateLimit']) {
    if (fetched[key]) add(key, [del(fetched[key].path)]);
  }
  for (const w of fetched.writeWindows ?? []) add('write window', [del(w.path)]);

  return { groups, deleteAuthUser: Boolean(fetched.authUser) };
}

/** Packs groups into batches of at most `limit` ops, keeping a group whole when it fits. */
export function chunkPlan(groups, limit = BATCH_LIMIT) {
  const batches = [];
  let current = [];
  for (const { ops } of groups) {
    if (current.length + ops.length > limit && current.length) {
      batches.push(current);
      current = [];
    }
    for (const op of ops) {
      if (current.length === limit) {
        batches.push(current);
        current = [];
      }
      current.push(op);
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Counts per label, for the log. */
export function summarise(plan) {
  const counts = {};
  for (const g of plan.groups) counts[g.label] = (counts[g.label] ?? 0) + 1;
  return counts;
}

export function describeOp(op) {
  if (op.kind === 'delete') return `DELETE ${op.path}`;
  if (op.set) return `UPDATE ${op.path} set ${JSON.stringify(op.set)}`;
  if (op.arrayRemove) return `UPDATE ${op.path} ${op.arrayRemove.field} remove ${JSON.stringify(op.arrayRemove.values)}`;
  return `UPDATE ${op.path} ${op.increment.field} ${op.increment.by > 0 ? '+' : ''}${op.increment.by}`;
}

/** Converts Firestore values to JSON-safe ones (timestamps become ISO strings). */
export function plain(v) {
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v.path === 'string' && typeof v.firestore === 'object') return v.path; // DocumentReference
  if (Array.isArray(v)) return v.map(plain);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
}

export function emulatorHosts(repoRoot = REPO_ROOT) {
  let ports = {};
  try {
    ports = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8')).emulators ?? {};
  } catch {
    // fall back to the defaults below
  }
  return {
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${ports.firestore?.port ?? 8080}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${ports.auth?.port ?? 9099}`,
  };
}

function defaultProject() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  const rc = join(REPO_ROOT, '.firebaserc');
  return existsSync(rc) ? JSON.parse(readFileSync(rc, 'utf8')).projects?.default : undefined;
}

// --- Firebase I/O -----------------------------------------------------------

const toDoc = (snap) => ({ path: snap.ref.path, data: plain(snap.data()) });

async function collect(db, auth, uid) {
  const q = async (query) => (await query.get()).docs.map(toDoc);
  const one = async (path) => {
    const s = await db.doc(path).get();
    return s.exists ? toDoc(s) : null;
  };
  const withMessages = async (docs) =>
    Promise.all(docs.map(async (d) => ({ ...d, messages: await q(db.collection(`${d.path}/messages`).orderBy('createdAt')) })));

  // shortcut: collaborators holds { uid, displayName } objects, which no query can match
  // on uid alone, so every recipe is read. Fine for a private circle; add a
  // `collaboratorUids` array field and an array-contains query if the feed grows large.
  const allRecipes = await q(db.collection('recipes'));
  const ownRecipes = allRecipes.filter((r) => r.data.createdBy?.uid === uid);
  const collaboratorRecipes = allRecipes.filter(
    (r) => r.data.createdBy?.uid !== uid && (r.data.collaborators ?? []).some((c) => c?.uid === uid),
  );

  // Under the rules a reply can only be written by one of a thread's two parties, so the
  // threads fetched here hold every reply the uid wrote. The collection-group query is a
  // cross-check; in production it needs a collection-group index on messages.fromUid.
  let strayMessages = [];
  try {
    strayMessages = await q(db.collectionGroup('messages').where('fromUid', '==', uid));
  } catch (err) {
    if (err.code !== 9) throw err; // 9 = FAILED_PRECONDITION, the missing-index error
    console.warn(`WARNING: collection-group query on messages.fromUid needs an index (${err.message.split('\n')[0]}).`);
    console.warn('Continuing with the per-thread reads, which cover every reply the rules allow.');
  }

  const favorites = await q(db.collection('favorites').where('uid', '==', uid));
  const follows = [
    ...(await q(db.collection('follows').where('followerId', '==', uid))),
    ...(await q(db.collection('follows').where('followingId', '==', uid))),
  ];

  // Current counter values, so a decrement never takes a counter below zero.
  const counterPaths = [
    ...favorites.map((f) => `recipes/${f.data.recipeId}`),
    ...follows.map((f) => `profiles/${f.data.followerId === uid ? f.data.followingId : f.data.followerId}`),
  ];
  const counters = {};
  for (const p of new Set(counterPaths)) counters[p] = (await one(p))?.data ?? null;

  let authUser = null;
  try {
    const { passwordHash: _h, passwordSalt: _s, ...rest } = (await auth.getUser(uid)).toJSON();
    authUser = rest;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  return {
    authUser,
    profile: await one(`profiles/${uid}`),
    termsAcceptance: await one(`termsAcceptance/${uid}`),
    rateLimit: await one(`rateLimits/${uid}`),
    writeWindows: (await Promise.all(['suggestion', 'reply', 'notification', 'recipe'].map((a) => one(`writeWindows/${uid}_${a}`)))).filter(Boolean),
    ownRecipes,
    collaboratorRecipes,
    favorites,
    favoritesOfOwnRecipes: (await q(db.collection('favorites').where('recipeOwnerId', '==', uid))).filter((f) => f.data.uid !== uid),
    follows,
    suggestionsAuthored: await withMessages(await q(db.collection('suggestions').where('suggestedBy.uid', '==', uid))),
    suggestionsOnOwn: await withMessages(await q(db.collection('suggestions').where('recipeOwnerId', '==', uid))),
    strayMessages,
    notifications: [
      ...(await q(db.collection('notifications').where('recipientUid', '==', uid))),
      ...(await q(db.collection('notifications').where('fromUid', '==', uid))),
    ],
    clientErrors: await q(db.collection('clientErrors').where('uid', '==', uid)),
    counters,
  };
}

/**
 * Replaces other people's identity in an export: each other uid becomes a stable
 * `other-user-N` (in fields and in document paths) and their display names become null.
 * Content is kept, including the other party's text in threads the requester is part of.
 * Mutates nothing; returns a new body.
 */
export function redactExport(uid, body) {
  const out = structuredClone(body);
  const ids = new Map();
  const alias = (u) => {
    if (typeof u !== 'string' || u === uid) return u;
    if (!ids.has(u)) ids.set(u, `other-user-${ids.size + 1}`);
    return ids.get(u);
  };
  const person = (p) => (p && p.uid !== uid ? { ...p, uid: alias(p.uid), displayName: null } : p);
  const named = (d, uidKey, nameKey) => {
    if (d[uidKey] !== uid && nameKey in d) d[nameKey] = null;
    if (uidKey in d) d[uidKey] = alias(d[uidKey]);
  };
  for (const r of out.recipes.owned) r.data.collaborators = (r.data.collaborators ?? []).map(person);
  for (const r of out.recipes.asCollaborator) {
    r.data.createdBy = person(r.data.createdBy);
    r.data.collaborators = (r.data.collaborators ?? []).map(person);
  }
  for (const f of out.favorites) f.data.recipeOwnerId = alias(f.data.recipeOwnerId);
  for (const f of out.follows) {
    named(f.data, 'followerId', 'followerDisplayName');
    f.data.followingId = alias(f.data.followingId);
  }
  for (const s of out.suggestions) {
    s.data.recipeOwnerId = alias(s.data.recipeOwnerId);
    s.data.suggestedBy = person(s.data.suggestedBy);
    for (const m of s.messages) named(m.data, 'fromUid', 'fromDisplayName');
  }
  for (const n of out.notifications) {
    named(n.data, 'fromUid', 'fromDisplayName');
    n.data.recipientUid = alias(n.data.recipientUid);
  }
  // Paths last, once every other uid has an alias. Composite ids are joined with `_`.
  const fixPath = (p) => p.split('/').map((seg) => seg.split('_').map((x) => ids.get(x) ?? x).join('_')).join('/');
  const docs = [
    out.profile, out.termsAcceptance, out.rateLimit, ...out.writeWindows, ...out.recipes.owned,
    ...out.recipes.asCollaborator, ...out.favorites, ...out.follows, ...out.suggestions,
    ...out.suggestions.flatMap((s) => s.messages), ...out.notifications, ...out.clientErrors,
  ].filter(Boolean);
  for (const d of docs) d.path = fixPath(d.path);
  out.redaction = "Other people's account ids are replaced with other-user-N and their display names removed. Content is kept.";
  return out;
}

/** The export: the uid's own data. Other users' bookmarks of the uid's recipes are left out. */
function exportBody(uid, project, target, f) {
  return {
    exportedAt: new Date().toISOString(),
    uid,
    project,
    target,
    authUser: f.authUser,
    profile: f.profile,
    termsAcceptance: f.termsAcceptance,
    rateLimit: f.rateLimit,
    writeWindows: f.writeWindows,
    recipes: { owned: f.ownRecipes, asCollaborator: f.collaboratorRecipes },
    favorites: f.favorites,
    follows: uniqueByPath(f.follows),
    suggestions: uniqueByPath([...f.suggestionsAuthored, ...f.suggestionsOnOwn]),
    notifications: uniqueByPath(f.notifications),
    clientErrors: f.clientErrors,
  };
}

function countExport(body) {
  return {
    authUser: body.authUser ? 1 : 0,
    profile: body.profile ? 1 : 0,
    termsAcceptance: body.termsAcceptance ? 1 : 0,
    rateLimit: body.rateLimit ? 1 : 0,
    writeWindows: body.writeWindows.length,
    ownedRecipes: body.recipes.owned.length,
    collaboratorRecipes: body.recipes.asCollaborator.length,
    favorites: body.favorites.length,
    follows: body.follows.length,
    suggestions: body.suggestions.length,
    messages: body.suggestions.reduce((n, s) => n + s.messages.length, 0),
    notifications: body.notifications.length,
    clientErrors: body.clientErrors.length,
  };
}

async function execute(db, admin, plan) {
  const { FieldValue } = admin;
  const add = (batch, op) => {
    const ref = db.doc(op.path);
    if (op.kind === 'delete') batch.delete(ref);
    else if (op.set) batch.update(ref, op.set);
    else if (op.arrayRemove) batch.update(ref, { [op.arrayRemove.field]: FieldValue.arrayRemove(...op.arrayRemove.values) });
    else batch.update(ref, { [op.increment.field]: FieldValue.increment(op.increment.by) });
  };
  const failed = [];
  const batches = chunkPlan(plan.groups);
  for (const [i, ops] of batches.entries()) {
    const batch = db.batch();
    for (const op of ops) add(batch, op);
    try {
      await batch.commit();
      console.log(`batch ${i + 1}/${batches.length}: ${ops.length} writes committed`);
    } catch (err) {
      // One vanished document (a counterparty deleted meanwhile) must not block the rest.
      console.warn(`batch ${i + 1}/${batches.length} failed (${err.message.split('\n')[0]}); retrying one write at a time`);
      for (const op of ops) {
        try {
          const one = db.batch();
          add(one, op);
          await one.commit();
        } catch (e) {
          failed.push(op);
          console.warn(`  FAILED ${describeOp(op)}: ${e.message.split('\n')[0]}`);
        }
      }
    }
  }
  return failed;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(`${opts.error}\n${USAGE}`);
    return 2;
  }
  // Every check up to the import below runs before firebase-admin is loaded.
  const refusal = checkConfirmation(opts);
  if (refusal) {
    console.error(refusal);
    return 1;
  }
  const out = opts.out ?? defaultOutPath(opts.uid);
  if (opts.command === 'export') {
    const bad = checkOutPath(out);
    if (bad) {
      console.error(bad);
      return 1;
    }
  }

  const where = resolveTarget(opts, process.env, emulatorHosts());
  if (where.error) {
    console.error(where.error);
    return 1;
  }
  Object.assign(process.env, where.env);
  const project = opts.project ?? defaultProject();
  const target = opts.emulator
    ? `EMULATOR (firestore ${process.env.FIRESTORE_EMULATOR_HOST}, auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST})`
    : 'PRODUCTION';
  console.log(`${opts.command} ${opts.uid} on project ${project}, target ${target}`);

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const firestoreMod = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const app = initializeApp(opts.emulator ? { projectId: project } : { credential: applicationDefault(), projectId: project });
  const db = firestoreMod.getFirestore(app);
  const auth = getAuth(app);

  const fetched = await collect(db, auth, opts.uid);

  if (opts.command === 'export') {
    const body = redactExport(opts.uid, exportBody(opts.uid, project, target, fetched));
    // 'wx' never overwrites; mode applies because the file is always new.
    writeFileSync(out, JSON.stringify(body, null, 2), { mode: 0o600, flag: 'wx' });
    console.table(countExport(body));
    console.log(`wrote ${out}\nSend it to the requester, then delete it. Do not keep a copy.`);
    return 0;
  }

  const plan = buildErasePlan(opts.uid, fetched);
  for (const g of plan.groups) for (const op of g.ops) console.log(`  ${describeOp(op)}`);
  if (plan.deleteAuthUser) console.log(`  DELETE auth user ${opts.uid}`);
  console.table(summarise(plan));
  const writes = plan.groups.reduce((n, g) => n + g.ops.length, 0);
  console.log(`${writes} document writes in ${chunkPlan(plan.groups).length} batches, auth user: ${plan.deleteAuthUser ? 'delete' : 'none found'}`);

  if (!opts.execute) {
    console.log('DRY RUN: nothing was changed. Add --execute to apply.');
    return 0;
  }
  const failed = await execute(db, firestoreMod, plan);
  if (failed.length) console.warn(`${failed.length} writes failed; the re-check below shows what is left`);
  if (plan.deleteAuthUser) {
    await auth.deleteUser(opts.uid);
    console.log(`auth user ${opts.uid} deleted`);
  }
  const left = buildErasePlan(opts.uid, await collect(db, auth, opts.uid));
  const remaining = left.groups.reduce((n, g) => n + g.ops.length, 0) + (left.deleteAuthUser ? 1 : 0);
  console.log(`re-checked after erase: ${remaining} writes still planned (expected 0)`);
  return remaining === 0 && failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
