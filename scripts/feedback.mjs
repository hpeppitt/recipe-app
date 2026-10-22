#!/usr/bin/env node
// Operator tool for beta feedback (RL-289). Runbook: docs/operations.md, "Reading beta feedback".
// Uses the Firebase Admin SDK, which bypasses the security rules (clients cannot update or
// delete feedback, RL-285).
//
//   node scripts/feedback.mjs list  (--project <id> | --emulator)
//   node scripts/feedback.mjs save   <dir> (--project <id> | --emulator)
//   node scripts/feedback.mjs delete <id...> (--project <id> | --emulator) [--confirm <projectId>]
//   node scripts/feedback.mjs prune --older-than 365d (--project <id> | --emulator) [--confirm <projectId>]
//
// delete and prune print what they would delete and change nothing unless --confirm is
// given the project id. Credentials as in data-request.mjs. Pure helpers are exported and
// tested in feedback.test.mjs.

import { writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOutPath, resolveTarget, resolveProject, emulatorHosts, plain, REPO_ROOT } from './data-request.mjs';

const USAGE = `usage:
  node scripts/feedback.mjs list (--project <id> | --emulator)
  node scripts/feedback.mjs save <dir> (--project <id> | --emulator)
  node scripts/feedback.mjs delete <id...> (--project <id> | --emulator) [--confirm <projectId>]
  node scripts/feedback.mjs prune --older-than 365d (--project <id> | --emulator) [--confirm <projectId>]
delete and prune are a dry run unless --confirm is the project id.`;

const BATCH = 400;
const PAGE = 100;
export const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Strips C0 and C1 control characters (ESC included) but keeps tab and newline. */
export const clean = (v) => String(v ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
/** clean for a one-line field. */
export const line = (v) => clean(v).replace(/[\t\n]+/g, ' ');

// --- Pure logic -------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { command: null, args: [], emulator: false, confirm: null, project: null, olderThan: null };
  const flags = { '--confirm': 'confirm', '--project': 'project', '--older-than': 'olderThan' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.match(/^(--(?:confirm|project|older-than))=(.*)$/);
    if (eq) opts[flags[eq[1]]] = eq[2];
    else if (flags[a]) {
      if (argv[i + 1] === undefined) return { error: `${a} needs a value` };
      opts[flags[a]] = argv[++i];
    } else if (a === '--emulator') opts.emulator = true;
    else if (a.startsWith('--')) return { error: `unknown flag ${a}` };
    else if (!opts.command) opts.command = a;
    else opts.args.push(a);
  }
  const { command, args } = opts;
  if (!['list', 'save', 'delete', 'prune'].includes(command)) return { error: `unknown command ${command}` };
  if (command === 'list' && args.length) return { error: 'list takes no arguments' };
  if (command === 'save' && args.length !== 1) return { error: 'save needs one directory' };
  if (command === 'delete') {
    if (!args.length) return { error: 'delete needs at least one id' };
    const bad = args.find((id) => !ID_RE.test(id));
    if (bad) return { error: `not a valid feedback id: ${bad}` };
  }
  if (command === 'prune') {
    if (args.length) return { error: 'prune takes no ids; use --older-than' };
    if (!opts.olderThan) return { error: 'prune needs --older-than, for example 365d' };
    if (parseOlderThan(opts.olderThan) === null) return { error: `--older-than must look like 365d, not ${opts.olderThan}` };
  }
  if (opts.olderThan && command !== 'prune') return { error: '--older-than applies to prune only' };
  if (opts.confirm !== null && !['delete', 'prune'].includes(command)) return { error: '--confirm applies to delete and prune only' };
  return opts;
}

/** "365d" to 365; null for anything else (zero included). */
export function parseOlderThan(s) {
  const m = /^(\d{1,5})d$/.exec(s ?? '');
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** Items created strictly before now minus `days` days. `createdAt` is an ISO string. */
export function pruneCutoff(days, now = new Date()) {
  return new Date(now.getTime() - days * 86400000);
}
export function selectOlderThan(items, cutoff) {
  return items.filter((i) => new Date(i.createdAt) < cutoff);
}

/** Null when the run may execute; otherwise the dry-run reason. */
export function dryRunReason(opts, project) {
  if (opts.confirm === project) return null;
  return opts.confirm ? `--confirm ${opts.confirm} is not the project id ${project}` : `add --confirm ${project} to delete`;
}

/** YYYY-MM-DD from an ISO string. */
export const dateOf = (iso) => String(iso).slice(0, 10);
/** `<date>-<id>`, the base for both saved files. */
export const fileBase = (item) => `${dateOf(item.createdAt)}-${item.id}`;

/** Decodes a JPEG data URL to bytes; null when it is not one. */
export function decodeScreenshot(url) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(url ?? '');
  return m ? Buffer.from(m[1], 'base64') : null;
}

export const newestFirst = (items) => [...items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

/** One list entry. The note is last, on its own indented lines. */
export function formatListEntry(i) {
  const head = [dateOf(i.createdAt), i.displayName == null ? '(no name)' : line(i.displayName), i.uid, i.path, i.appVersion, i.viewport, i.theme].map(line);
  head.push(i.screenshot ? 'screenshot' : 'no screenshot');
  return `${line(i.id)}  ${head.join(' | ')}\n${clean(i.note).replace(/^/gm, '    ')}`;
}

/** Markdown note with every field except the screenshot itself. `jpgName` is set only when the .jpg is written. */
export function formatNote(i, jpgName = null) {
  return [
    `# Feedback ${line(i.id)}`,
    '',
    `- id: ${line(i.id)}`,
    `- created: ${line(i.createdAt)}`,
    `- uid: ${line(i.uid)}`,
    `- display name: ${line(i.displayName)}`,
    `- path: ${line(i.path)}`,
    `- app version: ${line(i.appVersion)}`,
    `- viewport: ${line(i.viewport)}`,
    `- theme: ${line(i.theme)}`,
    `- user agent: ${line(i.userAgent)}`,
    `- screenshot: ${jpgName ?? 'none'}`,
    '',
    '## Note',
    '',
    clean(i.note),
    '',
  ].join('\n');
}

/** The files `save` writes for one item, .jpg first so the .md names it only if it decoded. */
export function planSave(i) {
  const jpg = decodeScreenshot(i.screenshot);
  const files = jpg ? [{ name: `${fileBase(i)}.jpg`, data: jpg }] : [];
  files.push({ name: `${fileBase(i)}.md`, data: formatNote(i, jpg ? `${fileBase(i)}.jpg` : null) });
  return files;
}

/** Splits a deletion into batches of at most `size` ids. */
export const batches = (list, size = BATCH) => Array.from({ length: Math.ceil(list.length / size) }, (_, k) => list.slice(k * size, (k + 1) * size));

/** The message printed when a batch commit fails part way. */
export const partialMessage = (deleted, total) => `${deleted} of ${total} deleted; rerun to finish`;

// --- Firebase I/O -----------------------------------------------------------

function firebaseProjects() {
  const rc = join(REPO_ROOT, '.firebaserc');
  return existsSync(rc) ? JSON.parse(readFileSync(rc, 'utf8')).projects ?? {} : {};
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(`${opts.error}\n${USAGE}`);
    return 2;
  }
  if (opts.command === 'save') {
    // The directory must exist and sit outside the repo: screenshots are personal data.
    const bad = checkOutPath(join(opts.args[0], '.feedback-check')) ?? (statSync(opts.args[0]).isDirectory() ? null : `not a directory: ${opts.args[0]}`);
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
  const picked = resolveProject(opts, firebaseProjects());
  if (picked.error) {
    console.error(picked.error);
    return 1;
  }
  const { project } = picked;
  const target = opts.emulator ? `EMULATOR (firestore ${process.env.FIRESTORE_EMULATOR_HOST})` : picked.label;
  console.log(`${opts.command} on project ${project}, target ${target}`);

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp(opts.emulator ? { projectId: project } : { credential: applicationDefault(), projectId: project });
  const db = getFirestore(app);

  const col = db.collection('feedback');
  // Pages of PAGE docs, newest first, optionally reading only some fields.
  const eachPage = async (fields, onPage) => {
    let last = null;
    for (;;) {
      let q = col.orderBy('createdAt', 'desc').limit(PAGE);
      if (fields) q = q.select(...fields);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) return;
      await onPage(snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) })));
      if (snap.size < PAGE) return;
      last = snap.docs[snap.size - 1];
    }
  };

  if (opts.command === 'list') {
    // select() cannot give a "has a screenshot" flag, so list reads whole pages and keeps
    // only the flag.
    let n = 0;
    await eachPage(null, (page) => {
      for (const i of page) console.log(formatListEntry({ ...i, screenshot: Boolean(i.screenshot) }));
      n += page.length;
    });
    console.log(`${n} items`);
    return 0;
  }
  if (opts.command === 'save') {
    const dir = resolve(opts.args[0]);
    let items = 0;
    let n = 0;
    await eachPage(null, (page) => {
      for (const i of page) {
        if (!ID_RE.test(i.id)) {
          console.warn(`  invalid id, skipped ${line(i.id)}`);
          continue;
        }
        items++;
        for (const f of planSave(i)) {
          // 'wx' never overwrites; a rerun skips what is already saved.
          try {
            writeFileSync(join(dir, f.name), f.data, { mode: 0o600, flag: 'wx' });
            n++;
          } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            console.warn(`  exists, skipped ${f.name}`);
          }
        }
      }
    });
    console.log(`${items} items, ${n} files written to ${dir}. Delete the folder when handled.`);
    return 0;
  }

  let doomed = [];
  const cutoff = opts.command === 'prune' ? pruneCutoff(parseOlderThan(opts.olderThan)) : null;
  if (cutoff) console.log(`older than ${opts.olderThan}: created before ${cutoff.toISOString()}`);
  const wanted = new Set(opts.args);
  await eachPage(['createdAt'], (page) => {
    for (const i of page) if (cutoff ? selectOlderThan([i], cutoff).length : wanted.has(i.id)) doomed.push(i);
  });
  for (const id of opts.args) if (!doomed.some((i) => i.id === id)) console.warn(`  not found: ${line(id)}`);
  for (const i of doomed) console.log(`  DELETE feedback/${i.id}  ${dateOf(i.createdAt)}`);
  console.log(`${doomed.length} documents to delete`);
  const why = dryRunReason(opts, project);
  if (why) {
    console.log(`DRY RUN: nothing was changed. ${why}.`);
    return opts.confirm ? 1 : 0;
  }
  let deleted = 0;
  try {
    for (const ids of batches(doomed.map((i) => i.id))) {
      const batch = db.batch();
      for (const id of ids) batch.delete(col.doc(id));
      await batch.commit();
      deleted += ids.length;
    }
  } catch (e) {
    console.error(`${e.message}\n${partialMessage(deleted, doomed.length)}`);
    return 1;
  }
  console.log(`${deleted} documents deleted`);
  return 0;
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
