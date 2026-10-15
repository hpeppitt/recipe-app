import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TERMS_VERSION } from '../lib/legal';

const getDoc = vi.fn();
const setDoc = vi.fn();
vi.mock('./firebase', () => ({ firestore: { __mock: true }, isFirebaseConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  getDoc: (ref: unknown) => getDoc(ref),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  serverTimestamp: () => 'SERVER_TS',
}));

const { getAcceptedTermsVersion, recordTermsAcceptance } = await import('./firestore');

describe('terms acceptance (RL-047)', () => {
  beforeEach(() => {
    getDoc.mockReset();
    setDoc.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('reads the version from termsAcceptance/{uid}, null when missing or malformed', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ version: '2026-10-15' }) });
    expect(await getAcceptedTermsVersion('u')).toBe('2026-10-15');
    expect(getDoc).toHaveBeenCalledWith({ col: 'termsAcceptance', id: 'u' });
    getDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await getAcceptedTermsVersion('u')).toBeNull();
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ version: 7 }) });
    expect(await getAcceptedTermsVersion('u')).toBeNull();
  });

  it('a failed read rejects with the original error', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
    getDoc.mockRejectedValueOnce(denied);
    await expect(getAcceptedTermsVersion('u')).rejects.toBe(denied);
  });

  it('writes exactly version, acceptedAt and a server recordedAt', async () => {
    setDoc.mockResolvedValueOnce(undefined);
    await recordTermsAcceptance('u', 123);
    expect(setDoc).toHaveBeenCalledWith(
      { col: 'termsAcceptance', id: 'u' },
      { version: TERMS_VERSION, acceptedAt: 123, recordedAt: 'SERVER_TS' }
    );
  });

  it('a read or write that never settles rejects after 5 s', async () => {
    vi.useFakeTimers();
    getDoc.mockReturnValueOnce(new Promise(() => {}));
    setDoc.mockReturnValueOnce(new Promise(() => {}));
    const read = expect(getAcceptedTermsVersion('u')).rejects.toThrow('timed out');
    const write = expect(recordTermsAcceptance('u', 1)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await read;
    await write;
  });
});
