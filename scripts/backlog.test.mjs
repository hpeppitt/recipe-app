import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter, pickNext, validate } from './backlog.mjs';

const ticket = (fm, body = '\n## Acceptance criteria\n\n- [ ] x\n') => ({
  file: `${fm.id}.md`,
  path: `/x/${fm.id}.md`,
  frontmatter: {
    title: 't',
    status: 'ready',
    priority: 'P2',
    size: 'S',
    tier: 'standard',
    risk: 'reversible',
    reviewers: [],
    depends_on: [],
    ...fm,
  },
  body,
});

describe('parseFrontmatter', () => {
  it('reads scalars, inline lists, and dash lists', () => {
    const text = `---\nid: RL-001\ntitle: "Quoted title"\narea: [ui, data]\nreviewers:\n  - ui-reviewer\n  - data-integrity-reviewer\ndepends_on: []\n---\n\nBody here\n`;
    const { frontmatter, body } = parseFrontmatter(text);
    expect(frontmatter.id).toBe('RL-001');
    expect(frontmatter.title).toBe('Quoted title');
    expect(frontmatter.area).toEqual(['ui', 'data']);
    expect(frontmatter.reviewers).toEqual(['ui-reviewer', 'data-integrity-reviewer']);
    expect(frontmatter.depends_on).toEqual([]);
    expect(body.trim()).toBe('Body here');
  });

  it('returns null without a frontmatter block', () => {
    expect(parseFrontmatter('# no frontmatter')).toBeNull();
  });

  it('round-trips through serializeFrontmatter', () => {
    const fm = { id: 'RL-002', title: 'x', area: ['ui'], depends_on: [] };
    const out = serializeFrontmatter(fm, '\nBody\n');
    expect(parseFrontmatter(out).frontmatter).toEqual(fm);
  });
});

describe('pickNext', () => {
  it('prefers higher priority, then lower id', () => {
    const t = [
      ticket({ id: 'RL-003', priority: 'P2' }),
      ticket({ id: 'RL-001', priority: 'P3' }),
      ticket({ id: 'RL-002', priority: 'P2' }),
    ];
    expect(pickNext(t).frontmatter.id).toBe('RL-002');
  });

  it('skips tickets whose dependencies are not done', () => {
    const t = [
      ticket({ id: 'RL-001', priority: 'P1', depends_on: ['RL-002'] }),
      ticket({ id: 'RL-002', priority: 'P3', status: 'in-progress' }),
      ticket({ id: 'RL-003', priority: 'P3' }),
    ];
    expect(pickNext(t).frontmatter.id).toBe('RL-003');
  });

  it('treats released and dropped dependencies as satisfied', () => {
    const t = [
      ticket({ id: 'RL-001', depends_on: ['RL-002', 'RL-003'] }),
      ticket({ id: 'RL-002', status: 'released' }),
      ticket({ id: 'RL-003', status: 'dropped' }),
    ];
    expect(pickNext(t).frontmatter.id).toBe('RL-001');
  });

  it('skips tickets claimed by another session and never picks drafts', () => {
    const t = [ticket({ id: 'RL-001', priority: 'P1' }), ticket({ id: 'RL-002', status: 'draft' })];
    expect(pickNext(t, new Set(['RL-001']))).toBeNull();
  });
});

describe('validate', () => {
  it('accepts a groomed ticket and a bare draft', () => {
    const draft = { file: 'RL-009.md', frontmatter: { id: 'RL-009', title: 'd', status: 'draft', priority: 'P3' }, body: '' };
    expect(validate([ticket({ id: 'RL-001' }), draft])).toEqual([]);
  });

  it('flags missing grooming fields, bad enums, unknown deps, and id mismatch', () => {
    const bad = ticket({ id: 'RL-001', tier: 'huge', depends_on: ['RL-404'] }, '\nno criteria\n');
    delete bad.frontmatter.size;
    bad.file = 'RL-002.md';
    const problems = validate([bad]);
    expect(problems.some((p) => p.includes('id does not match'))).toBe(true);
    expect(problems.some((p) => p.includes('missing size'))).toBe(true);
    expect(problems.some((p) => p.includes('tier "huge"'))).toBe(true);
    expect(problems.some((p) => p.includes('RL-404'))).toBe(true);
    expect(problems.some((p) => p.includes('Acceptance criteria'))).toBe(true);
  });
});
