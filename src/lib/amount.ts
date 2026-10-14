const GLYPHS: Record<number, string> = {
  // 0.13 and 0.12 are an eighth after the two-decimal rounding below.
  0.12: '⅛', 0.13: '⅛', 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾',
};

export function formatAmount(amount: number): string {
  const whole = Math.floor(amount);
  const frac = Math.round((amount - whole) * 100) / 100;
  const fracStr =
    GLYPHS[frac] ?? (frac > 0 && frac < 1 ? (whole === 0 ? '0' : '') + frac.toString().slice(1) : '');
  if (whole === 0 && fracStr) return fracStr;
  if (fracStr) return `${whole}${fracStr}`;
  return amount.toString();
}
