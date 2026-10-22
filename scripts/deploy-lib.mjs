// Pure deploy helpers. No I/O, no network. The runner (RL-296) feeds them data.

export function resolveTarget(arg, env = {}) {
  if (arg !== 'dev' && arg !== 'prod') {
    throw new Error(`Target must be "dev" or "prod", got ${arg === undefined ? 'nothing' : `"${arg}"`}.`);
  }
  if (arg === 'prod' && !(env.GITHUB_ACTIONS === 'true' && env.DEPLOY_ENVIRONMENT === 'production')) {
    throw new Error('Production deploys only through the production workflow.');
  }
  return arg;
}

export function projectFor(target, firebaserc) {
  const projects = firebaserc?.projects ?? {};
  const dev = projects.dev;
  const prod = projects.prod;
  if (!dev) throw new Error('.firebaserc has no "dev" alias.');
  if (!prod) throw new Error('.firebaserc has no "prod" alias.');
  if (dev === prod) throw new Error('The dev and prod aliases point at the same project.');
  return target === 'prod' ? prod : dev;
}

export function termsVersionOf(rulesSource) {
  const m = /function\s+termsVersion\s*\(\s*\)\s*\{\s*return\s+(['"])([^'"]*)\1\s*;/.exec(rulesSource ?? '');
  return m ? m[2] : null;
}

export function orderFromTagMessage(message) {
  const m = /^\s*deploy-order:\s*(rules-first|client-first)\s*$/m.exec(message ?? '');
  return m ? m[1] : null;
}

const ORDERS = ['rules-first', 'client-first'];

export function resolveOrder({ input, tagMessage, liveRules, headRules } = {}) {
  if (ORDERS.includes(input)) return { order: input, reason: 'dispatch input' };
  const tag = orderFromTagMessage(tagMessage);
  if (tag) return { order: tag, reason: 'tag message' };
  if (termsVersionOf(liveRules) !== termsVersionOf(headRules)) {
    return { order: 'rules-first', reason: 'Terms version changed' };
  }
  return { order: 'rules-first', reason: 'default' };
}

export function planSteps(target, order) {
  const pair = target === 'prod' && order === 'client-first' ? ['hosting', 'rules'] : ['rules', 'hosting'];
  return ['indexes', 'wait-indexes', ...pair, 'verify'];
}

export function allIndexesReady(json) {
  const building = (json?.indexes ?? []).filter((i) => i.state !== 'READY').map((i) => i.name);
  return { ready: building.length === 0, building };
}

const norm = (s) => String(s).replace(/\r\n?/g, '\n');
export const rulesMatch = (live, head) => norm(live) === norm(head);

function header(res, name) {
  const headers = res?.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key === undefined ? undefined : String(headers[key]);
}

export function checkHeaders({ root, sw, asset }) {
  const problems = [];
  const expectCache = (label, res, want) => {
    const got = header(res, 'cache-control');
    if (got === undefined || got.toLowerCase() !== want) problems.push(`${label}: Cache-Control is "${got ?? ''}", want "${want}"`);
  };
  expectCache('/', root, 'no-cache');
  expectCache('/sw.js', sw, 'no-cache');
  expectCache('/assets/', asset, 'public, max-age=31536000, immutable');
  for (const [label, res] of [['/', root], ['/sw.js', sw], ['/assets/', asset]]) {
    if (header(res, 'x-frame-options')?.toUpperCase() !== 'DENY') problems.push(`${label}: X-Frame-Options must be DENY`);
    if (header(res, 'x-content-type-options')?.toLowerCase() !== 'nosniff') problems.push(`${label}: X-Content-Type-Options must be nosniff`);
  }
  return problems;
}

export function entryScriptOf(html) {
  for (const tag of String(html).match(/<script\b[^>]*>/gi) ?? []) {
    const m = /\bsrc=["'](\/assets\/[^"']+\.js)["']/i.exec(tag);
    if (m && /type=["']module["']/i.test(tag)) return m[1];
  }
  return null;
}

export const bundleTargets = (text, expectedId, otherId) =>
  text.includes(expectedId) && !text.includes(otherId);
