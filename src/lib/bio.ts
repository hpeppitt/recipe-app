export const BIO_MAX = 160;

/** One line, trimmed, at most BIO_MAX UTF-16 units (never ending on half a surrogate pair); empty is null. Used on write and on read, since a stored bio is not guaranteed clean. */
export function cleanBio(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, BIO_MAX);
  if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);
  s = s.trim();
  return s || null;
}
