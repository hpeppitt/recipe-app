export const RECIPE_EMOJI_FALLBACK = '🍽️'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const FLAG = /^\p{Regional_Indicator}{2}$/u

function emojiGraphemes(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return Array.from(segmenter.segment(value), (s) => s.segment).filter(
    (g) => PICTOGRAPHIC.test(g) || FLAG.test(g) || g.includes('⃣'),
  )
}

/** First emoji grapheme of `value`, or `fallback` when there is none. */
export function oneEmoji(value: unknown, fallback: string): string {
  return emojiGraphemes(value)[0] ?? fallback
}

/** Last emoji grapheme of `value`, or null. A newly typed emoji replaces the old one. */
export function lastEmoji(value: unknown): string | null {
  return emojiGraphemes(value).at(-1) ?? null
}
