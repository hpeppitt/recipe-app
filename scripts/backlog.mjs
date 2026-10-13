#!/usr/bin/env node
// Ticket backlog CLI. Zero dependencies on purpose: the orchestrator calls this
// instead of reading every ticket file, which is where the token saving lives.
//
//   node scripts/backlog.mjs list [status]      one line per ticket
//   node scripts/backlog.mjs next               the ticket an agent should pick up now
//   node scripts/backlog.mjs show RL-003         full ticket body
//   node scripts/backlog.mjs set RL-003 status in-progress
//   node scripts/backlog.mjs validate           frontmatter sanity, exits 1 on problems
//
// A ticket is backlog/tickets/<ID>.md with a YAML-ish frontmatter block. See
// backlog/README.md for the field contract. This file parses only the subset it needs:
// `key: value`, `key: [a, b]`, and `key:` followed by `  - item` lines.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
export const TICKETS_DIR = join(here, '..', 'backlog', 'tickets');

export const STATUSES = [
  'draft', // written, not yet groomed; an agent must not pick it up
  'ready', // groomed and unblocked
  'in-progress', // an agent has claimed it (a ticket/<ID> branch exists on origin)
  'done', // merged to main, awaiting the human QA pass
  'released', // deployed to live after a QA pass
  'blocked', // waiting on another ticket or an external fact
  'needs-human', // a decision only the author can make; see backlog/README.md
  'dropped', // decided against; kept for the record
];
export const PRIORITIES = ['P1', 'P2', 'P3'];
export const SIZES = ['S', 'M', 'L'];
export const TIERS = ['trivial', 'standard', 'hard'];
export const RISKS = ['reversible', 'irreversible'];
const LIST_FIELDS = new Set(['area', 'depends_on', 'reviewers', 'files']);
const TERMINAL = new Set(['done', 'released', 'dropped']);

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    let value = raw.trim();
    if (value === '' && lines[i + 1]?.match(/^\s+-\s/)) {
      const items = [];
      while (lines[i + 1]?.match(/^\s+-\s/)) {
        items.push(lines[++i].replace(/^\s+-\s*/, '').trim());
      }
      fm[key] = items;
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (LIST_FIELDS.has(key) && value === '') {
      fm[key] = [];
      continue;
    }
    fm[key] = value.replace(/^"(.*)"$/, '$1');
  }
  return { frontmatter: fm, body: m[2] };
}

export function serializeFrontmatter(fm, body) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return `${lines.join('\n')}\n${body.startsWith('\n') ? body : `\n${body}`}`;
}

export function loadTickets(dir = TICKETS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^RL-\d+\.md$/.test(f))
    .sort()
    .map((file) => {
      const path = join(dir, file);
      const parsed = parseFrontmatter(readFileSync(path, 'utf8'));
      return { file, path, ...(parsed ?? { frontmatter: {}, body: '' }) };
    });
}

export function validate(tickets) {
  const problems = [];
  const ids = new Set(tickets.map((t) => t.frontmatter.id));
  for (const t of tickets) {
    const fm = t.frontmatter;
    const want = (field, allowed) => {
      if (!fm[field]) problems.push(`${t.file}: missing ${field}`);
      else if (allowed && !allowed.includes(fm[field]))
        problems.push(`${t.file}: ${field} "${fm[field]}" not one of ${allowed.join('|')}`);
    };
    if (fm.id !== t.file.replace(/\.md$/, '')) problems.push(`${t.file}: id does not match filename`);
    want('title');
    want('status', STATUSES);
    want('priority', PRIORITIES);
    if (fm.status !== 'draft') {
      want('size', SIZES);
      want('tier', TIERS);
      want('risk', RISKS);
      if (!Array.isArray(fm.reviewers)) problems.push(`${t.file}: reviewers must be a list (may be empty)`);
      if (!/##\s*Acceptance criteria/i.test(t.body)) problems.push(`${t.file}: groomed ticket has no "## Acceptance criteria" section`);
    }
    for (const dep of fm.depends_on ?? []) {
      if (!ids.has(dep)) problems.push(`${t.file}: depends_on ${dep} does not exist`);
    }
  }
  return problems;
}

/** Remote ticket branches, used as the claim mechanism between parallel sessions. */
export function claimedIds() {
  try {
    const out = execSync("git ls-remote --heads origin 'refs/heads/ticket/*'", {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    });
    return new Set(
      out
        .split('\n')
        .map((l) => l.match(/refs\/heads\/ticket\/(RL-\d+)/)?.[1])
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function pickNext(tickets, claimed = new Set()) {
  const byId = new Map(tickets.map((t) => [t.frontmatter.id, t]));
  const depsDone = (t) =>
    (t.frontmatter.depends_on ?? []).every((d) => TERMINAL.has(byId.get(d)?.frontmatter.status));
  const candidates = tickets.filter(
    (t) => t.frontmatter.status === 'ready' && depsDone(t) && !claimed.has(t.frontmatter.id),
  );
  candidates.sort((a, b) => {
    const p = PRIORITIES.indexOf(a.frontmatter.priority) - PRIORITIES.indexOf(b.frontmatter.priority);
    return p !== 0 ? p : a.frontmatter.id.localeCompare(b.frontmatter.id, undefined, { numeric: true });
  });
  return candidates[0] ?? null;
}

function line(t) {
  const fm = t.frontmatter;
  const deps = fm.depends_on?.length ? ` deps=${fm.depends_on.join(',')}` : '';
  return `${fm.id}  ${fm.status.padEnd(12)} ${fm.priority} ${fm.size ?? '-'} ${(fm.tier ?? '-').padEnd(8)} ${fm.title}${deps}`;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const tickets = loadTickets();
  switch (cmd) {
    case 'list': {
      const filter = rest[0];
      const shown = filter ? tickets.filter((t) => t.frontmatter.status === filter) : tickets;
      if (shown.length === 0) console.log(filter ? `no tickets with status ${filter}` : 'no tickets');
      for (const t of shown) console.log(line(t));
      return 0;
    }
    case 'next': {
      const problems = validate(tickets);
      if (problems.length) {
        console.error(`backlog has ${problems.length} validation problem(s); run "validate"`);
        return 1;
      }
      const claimed = claimedIds();
      const t = pickNext(tickets, claimed);
      if (!t) {
        console.log('NONE');
        const waiting = tickets.filter((x) => x.frontmatter.status === 'ready');
        if (waiting.length) console.log(`(${waiting.length} ready ticket(s) are blocked by dependencies or claimed by another session)`);
        return 0;
      }
      console.log(line(t));
      console.log(`file: ${t.path}`);
      return 0;
    }
    case 'show': {
      const t = tickets.find((x) => x.frontmatter.id === rest[0]);
      if (!t) {
        console.error(`no ticket ${rest[0]}`);
        return 1;
      }
      console.log(readFileSync(t.path, 'utf8'));
      return 0;
    }
    case 'set': {
      const [id, field, ...valueParts] = rest;
      const t = tickets.find((x) => x.frontmatter.id === id);
      if (!t || !field) {
        console.error('usage: set <ID> <field> <value>');
        return 1;
      }
      const value = valueParts.join(' ');
      if (field === 'status' && !STATUSES.includes(value)) {
        console.error(`status must be one of ${STATUSES.join('|')}`);
        return 1;
      }
      const fm = { ...t.frontmatter };
      fm[field] = LIST_FIELDS.has(field)
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : value;
      if (field === 'status') fm.updated = new Date().toISOString().slice(0, 10);
      writeFileSync(t.path, serializeFrontmatter(fm, t.body));
      console.log(line({ frontmatter: fm }));
      return 0;
    }
    case 'validate': {
      const problems = validate(tickets);
      for (const p of problems) console.error(p);
      console.log(problems.length ? `${problems.length} problem(s)` : `${tickets.length} ticket(s) valid`);
      return problems.length ? 1 : 0;
    }
    default:
      console.log('usage: backlog <list [status] | next | show ID | set ID field value | validate>');
      return cmd ? 1 : 0;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
