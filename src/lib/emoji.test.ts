import { describe, expect, it } from 'vitest'
import { lastEmoji, oneEmoji, RECIPE_EMOJI_FALLBACK, typedEmoji } from './emoji'

const FB = 'X'
const family = '👨‍👩‍👧'
const thumb = '👍🏽'
const flag = '🇦🇺'
const scotland = '🏴󠁧󠁢󠁳󠁣󠁴󠁿'
const keycap = '1️⃣'

describe('oneEmoji', () => {
  it.each([
    ['a single emoji', '🍕', '🍕'],
    ['two emoji', '🍕🍝', '🍕'],
    ['three emoji', '🍕🍝🥗', '🍕'],
    ['a ZWJ family', `${family}🍕`, family],
    ['a skin tone modifier', `${thumb}🍕`, thumb],
    ['a flag', `${flag}🍕`, flag],
    ['a subdivision flag', `${scotland}🍕`, scotland],
    ['a keycap', `${keycap}🍕`, keycap],
    ['a trailing variation selector', '🍽️🍕', '🍽️'],
    ['text around an emoji', 'abc 🍕 def', '🍕'],
  ])('%s', (_n, input, expected) => {
    expect(oneEmoji(input, FB)).toBe(expected)
  })

  it.each([['plain letters', 'abc'], ['empty', ''], ['undefined', undefined], ['a number', 42]])(
    'falls back for %s',
    (_n, input) => {
      expect(oneEmoji(input, FB)).toBe(FB)
    },
  )

  it('exports the default fallback', () => {
    expect(RECIPE_EMOJI_FALLBACK).toBe('🍽️')
  })
})

describe('lastEmoji', () => {
  it('returns the last emoji', () => {
    expect(lastEmoji('🍕🍝')).toBe('🍝')
    expect(lastEmoji(`🍕${family}`)).toBe(family)
    expect(lastEmoji(`a ${flag} b`)).toBe(flag)
  })
  it('returns null when there is none', () => {
    expect(lastEmoji('abc')).toBeNull()
    expect(lastEmoji('')).toBeNull()
    expect(lastEmoji(undefined)).toBeNull()
    expect(lastEmoji(7)).toBeNull()
  })
})

describe('typedEmoji', () => {
  it('keeps the newly added emoji wherever it lands', () => {
    expect(typedEmoji('🍞', '🍞🧈')).toBe('🧈');
    expect(typedEmoji('🍞', '🧈🍞')).toBe('🧈');
    expect(typedEmoji('', '🧈')).toBe('🧈');
    expect(typedEmoji('🍞', '')).toBeNull();
  });
});
