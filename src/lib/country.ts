import { TIME_ZONE_COUNTRY } from './timeZoneCountry'

export function countryFromTimeZone(tz: string | undefined): string | null {
  return (tz && Object.hasOwn(TIME_ZONE_COUNTRY, tz) && TIME_ZONE_COUNTRY[tz]) || null
}

export function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Every code in the table, sorted by English name, for the profile picker. */
export const COUNTRY_CODES: string[] = [...new Set(Object.values(TIME_ZONE_COUNTRY))].sort(
  (a, b) => countryName(a).localeCompare(countryName(b)),
)

const CODES = new Set(COUNTRY_CODES)

export function isCountryCode(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z]{2}$/.test(v) && CODES.has(v)
}
