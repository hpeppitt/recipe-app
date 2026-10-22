import { describe, expect, it } from 'vitest'
import { COUNTRY_CODES, countryFromTimeZone, countryName, flagEmoji, isCountryCode } from './country'

describe('country', () => {
  it('maps zones and links to countries', () => {
    expect(countryFromTimeZone('Australia/Sydney')).toBe('AU')
    expect(countryFromTimeZone('Europe/London')).toBe('GB')
    expect(countryFromTimeZone('America/Los_Angeles')).toBe('US')
    expect(countryFromTimeZone('Asia/Kolkata')).toBe('IN')
    expect(countryFromTimeZone('Asia/Calcutta')).toBe('IN')
    expect(countryFromTimeZone('Pacific/Auckland')).toBe('NZ')
  })
  it('returns null for unknown, UTC, Etc and undefined', () => {
    for (const z of ['UTC', 'Foo/Bar', 'Etc/GMT+5', 'toString', '', undefined]) {
      expect(countryFromTimeZone(z)).toBeNull()
    }
  })
  it('builds flags and names', () => {
    expect(flagEmoji('AU')).toBe('🇦🇺')
    expect(countryName('AU')).toBe('Australia')
    expect(countryName('ZZZZZ')).toBe('ZZZZZ')
  })
  it('validates codes against the list', () => {
    expect(isCountryCode('AU')).toBe(true)
    expect(isCountryCode('au')).toBe(false)
    expect(isCountryCode('XX')).toBe(false)
    expect(isCountryCode(5)).toBe(false)
  })
  it('sorts the list by name', () => {
    expect(COUNTRY_CODES).toContain('NZ')
    expect(COUNTRY_CODES.indexOf('AU')).toBeLessThan(COUNTRY_CODES.indexOf('NZ'))
  })
})
