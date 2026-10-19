import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../lib/constants';
import { parseIntroState } from '../lib/onboarding';
import * as storage from './storage';

function memoryStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const boom = () => {
  throw new Error('blocked');
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  warn.mockRestore();
});

function blockedBy(kind: 'methods' | 'access') {
  if (kind === 'methods') {
    vi.stubGlobal('localStorage', {
      getItem: boom,
      setItem: boom,
      removeItem: boom,
    });
  } else {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      get: boom,
      configurable: true,
    });
  }
}

describe.each(['methods', 'access'] as const)('blocked storage (%s throw)', (kind) => {
  beforeEach(() => blockedBy(kind));
  afterEach(() => {
    // defineProperty replaced the stub; drop it so later tests start clean.
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('returns every documented default', () => {
    expect(storage.getTheme()).toBe('system');
    expect(storage.getUnitSystem()).toBe('original');
    expect(storage.getAnonymousUid()).toBeNull();
    expect(storage.getPreviousUids()).toEqual([]);
    expect(storage.getIntroState()).toEqual(parseIntroState(null));
    expect(storage.getEmailForLinking()).toBeNull();
  });

  it('swallows writes and removes with a warning', () => {
    expect(() => {
      storage.setTheme('dark');
      storage.setUnitSystem('metric');
      storage.setAnonymousUid('u1');
      storage.clearAnonymousUid();
      storage.addPreviousUid('u2');
      storage.setIntroState(storage.getIntroState());
      storage.setEmailForLinking('a@b.c');
      storage.clearEmailForLinking();
    }).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c: unknown[]) => String(c[0]).includes(STORAGE_KEYS.THEME))).toBe(
      true,
    );
  });

  it('getDeviceId gives a stable non-empty id and persists nothing', async () => {
    vi.resetModules(); // the other variant must not reuse the cached id
    const fresh = await import('./storage');
    const id = fresh.getDeviceId();
    expect(id).toBeTruthy();
    expect(fresh.getDeviceId()).toBe(id);
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).localStorage;
    const store = memoryStore();
    vi.stubGlobal('localStorage', store);
    expect(store.getItem(STORAGE_KEYS.DEVICE_ID)).toBeNull();
  });

  it('a failed write warns exactly once, naming the key', () => {
    warn.mockClear();
    storage.setTheme('dark');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(STORAGE_KEYS.THEME);
  });

  it('a failed remove warns naming the key', () => {
    warn.mockClear();
    storage.clearAnonymousUid();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(STORAGE_KEYS.ANONYMOUS_UID);
  });
});

describe('device id without randomUUID', () => {
  const blocked = () =>
    vi.stubGlobal('localStorage', {
      getItem: boom,
      setItem: boom,
      removeItem: boom,
    });

  it.each([
    ['getRandomValues only', { getRandomValues: (a: Uint8Array) => a.fill(171) }],
    ['no crypto functions', {}],
    ['throwing getRandomValues', { getRandomValues: boom }],
  ])('%s: returns a stable non-empty id and never throws', async (_n, fake) => {
    vi.resetModules();
    vi.stubGlobal('crypto', fake);
    blocked();
    const fresh = await import('./storage');
    let id = '';
    expect(() => (id = fresh.getDeviceId())).not.toThrow();
    expect(id).not.toBe('');
    expect(fresh.getDeviceId()).toBe(id);
  });
});

describe('device id with a read-only store', () => {
  it('setItem throws (quota, private mode): id is stable within the session', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { ...memoryStore(), setItem: boom });
    const fresh = await import('./storage');
    const id = fresh.getDeviceId();
    expect(id).toBeTruthy();
    expect(fresh.getDeviceId()).toBe(id);
  });

  it('returns an already stored id unchanged', async () => {
    vi.resetModules();
    const store = memoryStore({ [STORAGE_KEYS.DEVICE_ID]: 'existing-id' });
    const set = vi.spyOn(store, 'setItem');
    vi.stubGlobal('localStorage', store);
    const fresh = await import('./storage');
    expect(fresh.getDeviceId()).toBe('existing-id');
    expect(set).not.toHaveBeenCalled();
  });
});

describe('corrupt values', () => {
  it('JSON-backed keys fall back to defaults', () => {
    vi.stubGlobal(
      'localStorage',
      memoryStore({
        [STORAGE_KEYS.PREVIOUS_UIDS]: '{not json',
        [STORAGE_KEYS.INTRO_STATE]: '{not json',
      }),
    );
    expect(storage.getPreviousUids()).toEqual([]);
    expect(() => storage.addPreviousUid('x')).not.toThrow();
    expect(storage.getIntroState()).toEqual(parseIntroState(null));
  });

  it.each([
    ['an object', '{"a":1}', []],
    ['a string', '"abc"', []],
    ['null', 'null', []],
    ['mixed array', '["a",1,null,"b",{}]', ['a', 'b']],
  ])('previous uids stored as %s', (_n, raw, expected) => {
    vi.stubGlobal('localStorage', memoryStore({ [STORAGE_KEYS.PREVIOUS_UIDS]: raw }));
    expect(storage.getPreviousUids()).toEqual(expected);
    expect(() => storage.addPreviousUid('z')).not.toThrow();
    expect(storage.getPreviousUids()).toEqual([...expected, 'z']);
  });

  it('out-of-set theme and unit system return the default', () => {
    vi.stubGlobal(
      'localStorage',
      memoryStore({
        [STORAGE_KEYS.THEME]: 'neon',
        [STORAGE_KEYS.UNIT_SYSTEM]: 'cubits',
      }),
    );
    expect(storage.getTheme()).toBe('system');
    expect(storage.getUnitSystem()).toBe('original');
  });
});

describe('round trip on a working store', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStore()));

  it('persists each setter for its getter', () => {
    storage.setTheme('dark');
    expect(storage.getTheme()).toBe('dark');
    storage.setUnitSystem('imperial');
    expect(storage.getUnitSystem()).toBe('imperial');
    storage.setAnonymousUid('u1');
    expect(storage.getAnonymousUid()).toBe('u1');
    storage.setAnonymousUid('u1');
    storage.setAnonymousUid('u2');
    expect(storage.getPreviousUids()).toEqual(['u1', 'u2']);
    storage.clearAnonymousUid();
    expect(storage.getAnonymousUid()).toBeNull();
    storage.setEmailForLinking('a@b.c');
    expect(storage.getEmailForLinking()).toBe('a@b.c');
    storage.clearEmailForLinking();
    expect(storage.getEmailForLinking()).toBeNull();
    const intro = storage.getIntroState();
    storage.setIntroState(intro);
    expect(storage.getIntroState()).toEqual(intro);
  });

  it('getDeviceId persists once it can', async () => {
    vi.resetModules(); // drop the session id cached by the blocked-storage tests
    const fresh = await import('./storage');
    const id = fresh.getDeviceId();
    expect(localStorage.getItem(STORAGE_KEYS.DEVICE_ID)).toBe(id);
    expect(fresh.getDeviceId()).toBe(id);
  });
});

describe('terms acceptance (RL-047)', () => {
  it('round-trips with a normalised email and clears', () => {
    vi.stubGlobal('localStorage', memoryStore());
    storage.setTermsAcceptance({ version: '2026-10-15', acceptedAt: 123, email: '  A@Example.COM ' });
    expect(storage.getTermsAcceptance()).toEqual({ version: '2026-10-15', acceptedAt: 123, email: 'a@example.com' });
    storage.clearTermsAcceptance();
    expect(storage.getTermsAcceptance()).toBeNull();
  });

  it.each([
    ['not json', '{nope'],
    ['null', 'null'],
    ['missing version', '{"acceptedAt":1,"email":"a@b.c"}'],
    ['non-int acceptedAt', '{"version":"v","acceptedAt":1.5,"email":"a@b.c"}'],
    ['string acceptedAt', '{"version":"v","acceptedAt":"1","email":"a@b.c"}'],
    ['no email (first version of RL-047)', '{"version":"v","acceptedAt":1}'],
    ['empty email', '{"version":"v","acceptedAt":1,"email":""}'],
  ])('an unusable value (%s) reads as none', (_n, raw) => {
    vi.stubGlobal('localStorage', memoryStore({ [STORAGE_KEYS.TERMS_ACCEPTANCE]: raw }));
    expect(storage.getTermsAcceptance()).toBeNull();
  });

  it('blocked storage reads as none and never throws', () => {
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(storage.getTermsAcceptance()).toBeNull();
    expect(() => {
      storage.setTermsAcceptance({ version: 'v', acceptedAt: 1, email: 'a@b.c' });
      storage.clearTermsAcceptance();
    }).not.toThrow();
  });
});
