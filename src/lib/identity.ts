const ADJECTIVES = [
  'Rustic', 'Golden', 'Crispy', 'Smoky', 'Spicy',
  'Zesty', 'Savory', 'Tangy', 'Silky', 'Toasty',
  'Peppy', 'Hearty', 'Mellow', 'Sunny', 'Lively',
  'Gentle', 'Swift', 'Daring', 'Jolly', 'Cosmic',
] as const;

const NOUNS = [
  'Chef', 'Baker', 'Pepper', 'Sage', 'Basil',
  'Truffle', 'Mango', 'Ginger', 'Olive', 'Saffron',
  'Walnut', 'Fennel', 'Thyme', 'Pretzel', 'Noodle',
  'Waffle', 'Biscuit', 'Chutney', 'Sorbet', 'Dumpling',
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

/** Generate a deterministic fun display name from a UID (e.g. "CrispyWaffle") */
export function generateDisplayName(uid: string): string {
  const hash = hashString(uid);
  const adj = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
  const noun = NOUNS[Math.abs(hash >> 8) % NOUNS.length];
  return `${adj}${noun}`;
}

/** Generate a deterministic HSL color from a UID */
export function uidToColor(uid: string): string {
  const hash = hashString(uid);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

/** Extract 1-2 character initials from a name */
export function getInitials(name: string | null): string {
  if (!name) return '?';
  // Split camelCase names like "CrispyWaffle" → ["Crispy", "Waffle"]
  const parts = name.match(/[A-Z][a-z]+/g);
  if (parts && parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Fallback: split on spaces
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}
