/** Stored analytics consent. Pure: storage and env access live in services/. */
export type ConsentValue = 'granted' | 'denied';

export interface ConsentChoice {
  analytics: ConsentValue;
  /** Client ms when the choice was made. */
  at: number;
  version: number;
}

/**
 * Bump when the analytics provider or what it collects changes. A stored choice
 * with any other version parses as "not chosen", so the banner asks again.
 */
export const CONSENT_VERSION = 1;

/** Null for anything malformed, wrong-version (older or newer) or unknown. */
export function parseConsent(raw: string | null): ConsentChoice | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ConsentChoice> | null;
    if (
      (p?.analytics !== 'granted' && p?.analytics !== 'denied') ||
      typeof p.at !== 'number' ||
      !Number.isFinite(p.at) ||
      p.version !== CONSENT_VERSION
    ) {
      return null;
    }
    return { analytics: p.analytics, at: p.at, version: p.version };
  } catch {
    return null;
  }
}

export function serialiseConsent(granted: boolean, at: number): string {
  const choice: ConsentChoice = {
    analytics: granted ? 'granted' : 'denied',
    at,
    version: CONSENT_VERSION,
  };
  return JSON.stringify(choice);
}

export function shouldShowBanner(posthogConfigured: boolean, choice: ConsentChoice | null): boolean {
  return posthogConfigured && choice === null;
}

export function isGranted(choice: ConsentChoice | null): boolean {
  return choice?.analytics === 'granted';
}

/** Google Analytics cookie names: `_ga` and `_ga_<container>`. */
export function gaCookieNames(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n === '_ga' || n.startsWith('_ga_'));
}

/**
 * `document.cookie` assignments that expire one cookie: no domain, the host, and
 * every parent domain (GA sets `.example.com`), all with path=/.
 */
export function expiryCookieStrings(name: string, hostname: string): string[] {
  const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  const out = [base];
  const labels = hostname.split('.');
  // An IP or single-label host (localhost) has no parent domains to try.
  if (labels.length > 1 && !/^[\d.]+$/.test(hostname)) {
    out.push(`${base}; domain=${hostname}`);
    for (let i = 0; i < labels.length - 1; i++) {
      out.push(`${base}; domain=.${labels.slice(i).join('.')}`);
    }
  }
  return out;
}
