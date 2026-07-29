/**
 * Display-time unit conversion.
 *
 * Never rewrites a stored recipe: a shared link must mean the same thing to
 * everyone, so conversion happens as the ingredient is rendered.
 *
 * Deliberately not a Gemini call. Conversion must be deterministic — the same
 * recipe has to show the same numbers on every device and to every recipient —
 * and a silently wrong quantity ruins a bake in a way the cook cannot detect.
 */

export type UnitSystem = 'original' | 'metric' | 'imperial';

/** Canonical unit keys. The stored `unit` is free text from the model. */
type CanonicalUnit =
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'floz'
  | 'pint'
  | 'quart';

/**
 * Unit spellings seen in generated recipes, mapped to a canonical key.
 *
 * Without this the toggle would work only on whichever spellings the tables
 * happen to contain, which is worse than not converting at all: the user cannot
 * tell which lines were skipped.
 */
const UNIT_ALIASES: Record<string, CanonicalUnit> = {
  g: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  cup: 'cup', cups: 'cup',
  floz: 'floz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
};

/** Millilitres per unit, for the volume units. */
const ML_PER: Partial<Record<CanonicalUnit, number>> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  floz: 29.5735,
  pint: 473.176,
  quart: 946.353,
  ml: 1,
  l: 1000,
};

/** Grams per unit, for the weight units. */
const G_PER: Partial<Record<CanonicalUnit, number>> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

const METRIC: CanonicalUnit[] = ['g', 'kg', 'ml', 'l'];
const IMPERIAL: CanonicalUnit[] = ['oz', 'lb', 'floz', 'cup', 'pint', 'quart'];

/**
 * Spoons belong to both systems, so they are never converted *away from*.
 *
 * Metric recipes say "1 tsp salt" as readily as imperial ones. Treating them as
 * imperial produced "2.46 ml Salt" from "½ tsp" — arithmetically right and
 * practically worse than leaving it alone. They remain valid *targets*, because
 * turning 15 ml into 1 tbsp genuinely helps someone with imperial spoons.
 */
const NEUTRAL: CanonicalUnit[] = ['tsp', 'tbsp'];

/**
 * Normalise a free-text unit to a canonical key.
 *
 * Strips punctuation ("tbsp." / "Tbsp") and collapses "fl oz" and its variants,
 * which arrive with and without the space.
 */
export function canonicalUnit(unit: string | null | undefined): CanonicalUnit | null {
  if (!unit) return null;
  const cleaned = unit.toLowerCase().replace(/[.\s]/g, '');
  if (cleaned === 'floz' || cleaned === 'fluidounce' || cleaned === 'fluidounces') return 'floz';
  return UNIT_ALIASES[cleaned] ?? null;
}

function systemOf(unit: CanonicalUnit): UnitSystem | null {
  if (NEUTRAL.includes(unit)) return null;
  if (METRIC.includes(unit)) return 'metric';
  if (IMPERIAL.includes(unit)) return 'imperial';
  return null;
}

/** Round to a sane number of decimals for the magnitude. */
function tidy(value: number): number {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export interface ConvertedAmount {
  amount: number;
  unit: string;
}

/**
 * Convert an amount to the target system, or return null to leave it as-is.
 *
 * Returns null — rather than guessing — whenever the conversion is not reliable:
 * an unrecognised unit, a count with no unit ("2 onions"), or a volume↔weight
 * crossing, which depends on the ingredient's density and is not something to
 * invent. A cup of flour and a cup of honey differ by more than 2x, so a generic
 * cups→grams number would be confidently wrong.
 */
export function convertAmount(
  amount: number | null,
  unit: string | null,
  target: UnitSystem
): ConvertedAmount | null {
  if (target === 'original' || amount == null) return null;

  const canonical = canonicalUnit(unit);
  if (!canonical) return null;

  const from = systemOf(canonical);
  if (!from || from === target) return null;

  // Weight → weight
  if (G_PER[canonical] != null) {
    const grams = amount * G_PER[canonical]!;
    if (target === 'metric') {
      return grams >= 1000
        ? { amount: tidy(grams / 1000), unit: 'kg' }
        : { amount: tidy(grams), unit: 'g' };
    }
    const ounces = grams / G_PER.oz!;
    return ounces >= 16
      ? { amount: tidy(ounces / 16), unit: 'lb' }
      : { amount: tidy(ounces), unit: 'oz' };
  }

  // Volume → volume
  if (ML_PER[canonical] != null) {
    const ml = amount * ML_PER[canonical]!;
    if (target === 'metric') {
      return ml >= 1000
        ? { amount: tidy(ml / 1000), unit: 'l' }
        : { amount: tidy(ml), unit: 'ml' };
    }
    // Pick the largest imperial measure that leaves a number worth reading.
    if (ml >= ML_PER.cup!) return { amount: tidy(ml / ML_PER.cup!), unit: 'cup' };
    if (ml >= ML_PER.tbsp!) return { amount: tidy(ml / ML_PER.tbsp!), unit: 'tbsp' };
    return { amount: tidy(ml / ML_PER.tsp!), unit: 'tsp' };
  }

  return null;
}

/**
 * Snap to a step a real oven dial has, so 350°F does not become a useless
 * 176.7°C.
 *
 * Computed rather than looked up in a table. A fixed table of steps silently
 * *clamped* anything above its top entry: 290°C is 554°F, which fell off the end
 * and came back as 500°F, collapsing "260-290°C" into "500-500°F". Rounding
 * arithmetically has no ceiling, so pizza-oven temperatures work.
 */
function snapC(value: number): number {
  return Math.round(value / 5) * 5;
}

function snapF(value: number): number {
  return Math.round(value / 25) * 25;
}

/**
 * Rewrite oven temperatures in a block of instruction text.
 *
 * Bounded deliberately:
 * - only plausible cooking temperatures convert, so a stray "200" or a duration
 *   like "350 minutes" is never mangled;
 * - a bare "180°" with no C/F is ambiguous and left alone rather than guessed;
 * - gas marks convert to neither system and are left alone;
 * - results snap to real dial steps rather than exact arithmetic.
 *
 * Returns the text unchanged when nothing qualifies, so callers can render the
 * original string without a special case.
 */
export function convertTemperatures(text: string, target: UnitSystem): string {
  if (target === 'original') return text;

  // Ranges first: "180-200°C" must not be converted one number at a time, which
  // would drop the shared unit from the first half.
  const withRanges = text.replace(
    /(\d{2,3})\s*[-–]\s*(\d{2,3})\s*°?\s*([CF])\b/gi,
    (match, lo: string, hi: string, unit: string) => {
      const from = unit.toUpperCase() === 'C' ? 'metric' : 'imperial';
      if (from === target) return match;
      const a = convertTemp(Number(lo), from, target);
      const b = convertTemp(Number(hi), from, target);
      if (a == null || b == null) return match;
      return `${a}-${b}°${target === 'metric' ? 'C' : 'F'}`;
    }
  );

  const converted = withRanges.replace(
    /(\d{2,3})\s*°?\s*([CF])\b/gi,
    (match, value: string, unit: string) => {
      const from = unit.toUpperCase() === 'C' ? 'metric' : 'imperial';
      if (from === target) return match;
      const c = convertTemp(Number(value), from, target);
      return c == null ? match : `${c}°${target === 'metric' ? 'C' : 'F'}`;
    }
  );

  return collapseDuplicateTemps(converted);
}

/**
 * Collapse "500-550°F or 500-550°F" back to a single figure.
 *
 * Recipes often helpfully write both systems ("500-550°F or 260-290°C").
 * Converting one into the other leaves the same value stated twice, which reads
 * like a rendering bug. Only exact duplicates are collapsed, so a genuine range
 * of two different temperatures is untouched.
 */
function collapseDuplicateTemps(text: string): string {
  const temp = String.raw`\d{2,3}(?:\s*[-–]\s*\d{2,3})?\s*°?\s*[CF]`;
  return text
    .replace(new RegExp(`\\((${temp}) or \\1\\)`, 'gi'), '($1)')
    .replace(new RegExp(`(${temp}) or \\1`, 'gi'), '$1');
}

function convertTemp(value: number, from: UnitSystem, target: UnitSystem): number | null {
  // Outside these bands it is not an oven temperature, so leave it alone.
  if (from === 'metric' && (value < 40 || value > 300)) return null;
  if (from === 'imperial' && (value < 100 || value > 550)) return null;

  if (from === 'metric' && target === 'imperial') {
    return snapF((value * 9) / 5 + 32);
  }
  if (from === 'imperial' && target === 'metric') {
    return snapC(((value - 32) * 5) / 9);
  }
  return null;
}
