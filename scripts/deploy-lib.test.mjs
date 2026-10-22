import { describe, it, expect } from 'vitest';
import {
  resolveTarget, projectFor, termsVersionOf, orderFromTagMessage, resolveOrder, planSteps,
  allIndexesReady, rulesMatch, checkHeaders, entryScriptOf, bundleTargets,
} from './deploy-lib.mjs';

const ci = { GITHUB_ACTIONS: 'true', DEPLOY_ENVIRONMENT: 'production' };
const rules = (v) => `function termsVersion() {\n  return '${v}';\n}`;

describe('resolveTarget', () => {
  it('errors with no or unknown target', () => {
    expect(() => resolveTarget(undefined, {})).toThrow();
    expect(() => resolveTarget('staging', {})).toThrow();
  });
  it('allows dev anywhere', () => expect(resolveTarget('dev', {})).toBe('dev'));
  it('refuses prod outside CI', () => expect(() => resolveTarget('prod', {})).toThrow(/production workflow/));
  it('refuses prod in CI without DEPLOY_ENVIRONMENT', () =>
    expect(() => resolveTarget('prod', { GITHUB_ACTIONS: 'true' })).toThrow(/production workflow/));
  it('allows prod in the production workflow', () => expect(resolveTarget('prod', ci)).toBe('prod'));
});

describe('projectFor', () => {
  const rc = { projects: { dev: 'rl-dev', prod: 'rl-prod' } };
  it('resolves both aliases', () => {
    expect(projectFor('dev', rc)).toBe('rl-dev');
    expect(projectFor('prod', rc)).toBe('rl-prod');
  });
  it('errors on a missing alias', () => {
    expect(() => projectFor('dev', { projects: { prod: 'x' } })).toThrow(/dev/);
    expect(() => projectFor('prod', { projects: { dev: 'x' } })).toThrow(/prod/);
    expect(() => projectFor('dev', {})).toThrow();
  });
  it('errors when dev equals prod', () =>
    expect(() => projectFor('dev', { projects: { dev: 'a', prod: 'a' } })).toThrow(/same/));
});

describe('termsVersionOf', () => {
  it('reads the version', () => expect(termsVersionOf(rules('2026-10-22'))).toBe('2026-10-22'));
  it('returns null when absent', () => expect(termsVersionOf('rules_version = "2";')).toBeNull());
});

describe('orderFromTagMessage', () => {
  it('reads the line', () => {
    expect(orderFromTagMessage('v1\n\ndeploy-order: client-first\n')).toBe('client-first');
    expect(orderFromTagMessage('deploy-order: rules-first')).toBe('rules-first');
  });
  it('returns null otherwise', () => {
    expect(orderFromTagMessage('v1')).toBeNull();
    expect(orderFromTagMessage('deploy-order: sideways')).toBeNull();
    expect(orderFromTagMessage(undefined)).toBeNull();
  });
});

describe('resolveOrder', () => {
  const same = { liveRules: rules('a'), headRules: rules('a') };
  it('input wins over the tag and the Terms bump', () =>
    expect(resolveOrder({ input: 'client-first', tagMessage: 'deploy-order: rules-first', liveRules: rules('a'), headRules: rules('b') }))
      .toEqual({ order: 'client-first', reason: 'dispatch input' }));
  it('tag wins over a Terms bump', () =>
    expect(resolveOrder({ tagMessage: 'deploy-order: client-first', liveRules: rules('a'), headRules: rules('b') }).order)
      .toBe('client-first'));
  it('Terms bump is rules first', () =>
    expect(resolveOrder({ liveRules: rules('a'), headRules: rules('b') }))
      .toEqual({ order: 'rules-first', reason: 'Terms version changed' }));
  it('defaults to rules first, never inferring client first', () => {
    expect(resolveOrder(same)).toEqual({ order: 'rules-first', reason: 'default' });
    expect(resolveOrder({ input: '', ...same }).order).toBe('rules-first');
  });
});

describe('planSteps', () => {
  it('dev is fixed whatever the order', () => {
    const dev = ['indexes', 'wait-indexes', 'rules', 'hosting', 'verify'];
    expect(planSteps('dev', 'rules-first')).toEqual(dev);
    expect(planSteps('dev', 'client-first')).toEqual(dev);
  });
  it('prod follows the order', () => {
    expect(planSteps('prod', 'rules-first')).toEqual(['indexes', 'wait-indexes', 'rules', 'hosting', 'verify']);
    expect(planSteps('prod', 'client-first')).toEqual(['indexes', 'wait-indexes', 'hosting', 'rules', 'verify']);
  });
});

describe('allIndexesReady', () => {
  it('true when all READY', () =>
    expect(allIndexesReady({ indexes: [{ name: 'a', state: 'READY' }] })).toEqual({ ready: true, building: [] }));
  it('lists those still CREATING', () =>
    expect(allIndexesReady({ indexes: [{ name: 'a', state: 'READY' }, { name: 'b', state: 'CREATING' }] }))
      .toEqual({ ready: false, building: ['b'] }));
  it('treats an empty response as ready', () => expect(allIndexesReady({}).ready).toBe(true));
});

describe('rulesMatch', () => {
  it('ignores CRLF', () => expect(rulesMatch('a\r\nb\r\n', 'a\nb\n')).toBe(true));
  it('detects a real difference', () => expect(rulesMatch('a\nb', 'a\nc')).toBe(false));
});

describe('checkHeaders', () => {
  const sec = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' };
  const good = {
    root: { headers: { 'Cache-Control': 'no-cache', ...sec } },
    sw: { headers: { 'cache-control': 'no-cache', ...sec } },
    asset: { headers: { 'cache-control': 'public, max-age=31536000, immutable', ...sec } },
  };
  it('passes a correct set, names case-insensitive', () => expect(checkHeaders(good)).toEqual([]));
  it('flags a missing nosniff', () => {
    const p = checkHeaders({ ...good, root: { headers: { 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY' } } });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/nosniff/);
  });
  it('flags /sw.js with a long cache', () => {
    const p = checkHeaders({ ...good, sw: { headers: { ...sec, 'Cache-Control': 'public, max-age=31536000, immutable' } } });
    expect(p.some((s) => s.startsWith('/sw.js'))).toBe(true);
  });
});

describe('entryScriptOf', () => {
  it('finds the module script', () =>
    expect(entryScriptOf('<script type="module" crossorigin src="/assets/index-abc.js"></script>')).toBe('/assets/index-abc.js'));
  it('returns null when none', () => expect(entryScriptOf('<html></html>')).toBeNull());
});

describe('bundleTargets', () => {
  it('true with only the expected id', () => expect(bundleTargets('x rl-dev y', 'rl-dev', 'rl-prod')).toBe(true));
  it('false when both ids are present', () => expect(bundleTargets('rl-dev rl-prod', 'rl-dev', 'rl-prod')).toBe(false));
  it('false when the expected id is absent', () => expect(bundleTargets('rl-prod', 'rl-dev', 'rl-prod')).toBe(false));
});
