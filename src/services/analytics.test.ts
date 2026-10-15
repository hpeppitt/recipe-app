// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../lib/constants';
import {
  analyticsProvider,
  clearLeftoverGaCookies,
  onConsentChange,
  reloadConsent,
  setAnalyticsConsent,
  setAnalyticsUserId,
  trackSignIn,
} from './analytics';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
});

const send = vi.spyOn(analyticsProvider, 'send');
const identify = vi.spyOn(analyticsProvider, 'identify');

beforeEach(() => {
  localStorage.clear();
  reloadConsent();
  send.mockClear();
  identify.mockClear();
});

describe('consent gate', () => {
  it('sends nothing before a choice', () => {
    trackSignIn('email');
    setAnalyticsUserId('u1');
    expect(send).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
  });

  it('lets calls through once granted, stops them on withdrawal, and tells listeners', () => {
    const l = vi.fn();
    const off = onConsentChange(l);
    setAnalyticsConsent(true);
    trackSignIn('email');
    setAnalyticsUserId('u1');
    expect(send).toHaveBeenCalledWith('sign_in', { method: 'email' });
    expect(identify).toHaveBeenCalledWith('u1');

    setAnalyticsConsent(false);
    trackSignIn('anonymous');
    setAnalyticsUserId('u2');
    expect(send).toHaveBeenCalledTimes(1);
    expect(identify).toHaveBeenCalledTimes(1);
    expect(l.mock.calls).toEqual([[true], [false]]);
    off();
    setAnalyticsConsent(true);
    expect(l).toHaveBeenCalledTimes(2);
  });

  it('stays closed after denied, and a stored grant loads on the next session', () => {
    setAnalyticsConsent(false);
    trackSignIn('email');
    expect(send).not.toHaveBeenCalled();
    localStorage.setItem(STORAGE_KEYS.ANALYTICS_CONSENT, JSON.stringify({ analytics: 'granted', at: 1, version: 1 }));
    reloadConsent();
    trackSignIn('email');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('clearLeftoverGaCookies', () => {
  it('expires _ga cookies once and keeps others', () => {
    document.cookie = '_ga=GA1; path=/';
    document.cookie = '_ga_ABC=x; path=/';
    document.cookie = 'keep=1; path=/';
    clearLeftoverGaCookies();
    expect(document.cookie).toBe('keep=1');
    expect(localStorage.getItem(STORAGE_KEYS.GA_COOKIES_CLEARED)).toBe('1');
    document.cookie = '_ga=again; path=/';
    clearLeftoverGaCookies();
    expect(document.cookie).toContain('_ga=again');
    document.cookie = '_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'keep=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });
});
