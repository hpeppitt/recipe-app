import { describe, it, expect } from 'vitest';
import { canonicalUnit, convertAmount, convertTemperatures } from './units';

describe('canonicalUnit', () => {
  it('accepts the spellings a model actually emits', () => {
    // The whole toggle silently no-ops on any spelling this misses, so the
    // aliases matter as much as the arithmetic.
    expect(canonicalUnit('tbsp')).toBe('tbsp');
    expect(canonicalUnit('Tbsp.')).toBe('tbsp');
    expect(canonicalUnit('tablespoons')).toBe('tbsp');
    expect(canonicalUnit('GRAMS')).toBe('g');
    expect(canonicalUnit('fl oz')).toBe('floz');
    expect(canonicalUnit('fluid ounces')).toBe('floz');
  });

  it('returns null for things that are not units', () => {
    expect(canonicalUnit(null)).toBeNull();
    expect(canonicalUnit('')).toBeNull();
    expect(canonicalUnit('cloves')).toBeNull();
    expect(canonicalUnit('large')).toBeNull();
  });
});

describe('convertAmount', () => {
  it('converts weight to weight', () => {
    // 500 g is 17.64 oz, which is over a pound, so it promotes rather than
    // reporting an awkward ounce count.
    expect(convertAmount(500, 'g', 'imperial')).toEqual({ amount: 1.1, unit: 'lb' });
    expect(convertAmount(200, 'g', 'imperial')).toEqual({ amount: 7.05, unit: 'oz' });
    expect(convertAmount(8, 'oz', 'metric')).toEqual({ amount: 227, unit: 'g' });
  });

  it('promotes to the larger unit when the number gets big', () => {
    expect(convertAmount(2, 'lb', 'metric')).toEqual({ amount: 907, unit: 'g' });
    expect(convertAmount(1500, 'g', 'metric')).toBeNull(); // already metric
    expect(convertAmount(40, 'oz', 'metric')?.unit).toBe('kg');
    expect(convertAmount(2000, 'g', 'imperial')?.unit).toBe('lb');
  });

  it('converts volume to volume', () => {
    expect(convertAmount(1, 'cup', 'metric')).toEqual({ amount: 237, unit: 'ml' });
    expect(convertAmount(250, 'ml', 'imperial')?.unit).toBe('cup');
    expect(convertAmount(15, 'ml', 'imperial')).toEqual({ amount: 1.01, unit: 'tbsp' });
    expect(convertAmount(2, 'l', 'imperial')?.unit).toBe('cup');
  });

  it('never converts away from spoons, which both systems use', () => {
    // "1/2 tsp salt" -> "2.46 ml salt" is arithmetically right and useless.
    expect(convertAmount(0.5, 'tsp', 'metric')).toBeNull();
    expect(convertAmount(2, 'tbsp', 'metric')).toBeNull();
    // ...but they remain useful targets coming from millilitres.
    expect(convertAmount(15, 'ml', 'imperial')?.unit).toBe('tbsp');
  });

  it('refuses volume-to-weight when the ingredient is unknown', () => {
    // A cup of flour and a cup of honey differ by more than 2x, so there is no
    // correct generic answer. With no name, or an unlisted one, the volume answer
    // stands rather than an invented density being applied.
    expect(convertAmount(1, 'cup', 'metric')?.unit).toBe('ml');
    expect(convertAmount(1, 'cup', 'metric', 'gochujang')?.unit).toBe('ml');
  });

  it('converts a cup of a known dry ingredient to grams, not millilitres', () => {
    // Regression: this returned 473 ml for two cups of flour. Arithmetically
    // right, and not a measure any cook uses.
    expect(convertAmount(2, 'cups', 'metric', 'plain flour')).toEqual({ amount: 250, unit: 'g' });
    expect(convertAmount(1, 'cup', 'metric', 'caster sugar')).toEqual({ amount: 200, unit: 'g' });
    expect(convertAmount(1, 'cup', 'metric', 'honey')).toEqual({ amount: 339, unit: 'g' });
  });

  it('goes back the other way, so grams become cups for an imperial cook', () => {
    // Previously 8.82 oz, which is a scale reading, not how flour is measured.
    expect(convertAmount(250, 'g', 'imperial', 'plain flour')).toEqual({ amount: 2, unit: 'cup' });
    expect(convertAmount(227, 'g', 'imperial', 'butter')).toEqual({ amount: 1, unit: 'cup' });
  });

  it('steps down to spoons when a weight is less than a quarter cup', () => {
    // 15 g of flour is 0.12 cups, which reads as nothing useful.
    expect(convertAmount(15, 'g', 'imperial', 'plain flour')?.unit).toBe('tbsp');
    expect(convertAmount(2, 'g', 'imperial', 'cocoa powder')?.unit).toBe('tsp');
  });

  it('leaves true liquids in millilitres, which is already idiomatic', () => {
    // Deliberately absent from the density table: 240 ml of milk needs no fixing.
    expect(convertAmount(1, 'cup', 'metric', 'whole milk')?.unit).toBe('ml');
    expect(convertAmount(1, 'cup', 'metric', 'olive oil')?.unit).toBe('ml');
  });

  it('matches the longest ingredient key, so a qualifier beats the bare word', () => {
    // "flour" is 125 g/cup and "chickpea flour" is 92; the qualified form must win
    // or every specialist flour silently gets the wrong density.
    expect(convertAmount(1, 'cup', 'metric', 'chickpea flour')).toEqual({ amount: 92, unit: 'g' });
    expect(convertAmount(1, 'cup', 'metric', 'wholemeal flour')).toEqual({ amount: 120, unit: 'g' });
    expect(convertAmount(1, 'cup', 'metric', 'icing sugar')).toEqual({ amount: 120, unit: 'g' });
  });

  it('matches whole words only', () => {
    // "flourless" must not be read as "flour".
    expect(convertAmount(1, 'cup', 'metric', 'flourless cake mix')?.unit).toBe('ml');
  });

  it('still never converts away from spoons, even with a known density', () => {
    // NEUTRAL wins: "1 tsp salt" has a density in the table but stays a teaspoon.
    expect(convertAmount(1, 'tsp', 'metric', 'salt')).toBeNull();
    expect(convertAmount(2, 'tbsp', 'metric', 'plain flour')).toBeNull();
  });

  it('leaves counts and unknown units alone', () => {
    expect(convertAmount(2, null, 'metric')).toBeNull();
    expect(convertAmount(2, 'cloves', 'metric')).toBeNull();
    expect(convertAmount(null, 'g', 'imperial')).toBeNull();
  });

  it('is a no-op when the amount is already in the target system', () => {
    expect(convertAmount(200, 'g', 'metric')).toBeNull();
    expect(convertAmount(1, 'cup', 'imperial')).toBeNull();
  });

  it('does nothing for the original system', () => {
    expect(convertAmount(200, 'g', 'original')).toBeNull();
  });
});

describe('convertTemperatures', () => {
  it('snaps to real oven dial steps, not exact arithmetic', () => {
    // 350F is 176.67C exactly, which is useless on a dial.
    expect(convertTemperatures('Bake at 350°F', 'metric')).toBe('Bake at 175°C');
    expect(convertTemperatures('Bake at 180°C', 'imperial')).toBe('Bake at 350°F');
  });

  it('handles the spacing and punctuation variants', () => {
    expect(convertTemperatures('Bake at 180 °C', 'imperial')).toBe('Bake at 350°F');
    expect(convertTemperatures('Bake at 180C', 'imperial')).toBe('Bake at 350°F');
  });

  it('converts a range as a range', () => {
    expect(convertTemperatures('Roast at 180-200°C', 'imperial')).toBe('Roast at 350-400°F');
  });

  it('handles high oven temperatures without collapsing the range', () => {
    // Regression: a fixed step table clamped anything above its top entry, so
    // 290C (554F) came back as 500F and "260-290" became "500-500".
    expect(convertTemperatures('Preheat to 260-290°C', 'imperial')).toBe('Preheat to 500-550°F');
    expect(convertTemperatures('Preheat to 550°F', 'metric')).toBe('Preheat to 290°C');
  });

  it('collapses a duplicate once both halves of "F or C" become the same', () => {
    // Recipes often write both systems; converting one leaves it stated twice.
    expect(
      convertTemperatures('Preheat to (500-550°F or 260-290°C).', 'imperial')
    ).toBe('Preheat to (500-550°F).');
    expect(convertTemperatures('Heat to 350°F or 175°C', 'metric')).toBe('Heat to 175°C');
  });

  it('keeps a genuine range of two different temperatures', () => {
    expect(convertTemperatures('Roast at 180-200°C', 'imperial')).toBe('Roast at 350-400°F');
  });

  it('leaves an ambiguous bare degree sign alone', () => {
    expect(convertTemperatures('Bake at 180°', 'imperial')).toBe('Bake at 180°');
  });

  it('leaves gas marks alone, since they convert to neither system', () => {
    expect(convertTemperatures('Bake at gas mark 4', 'metric')).toBe('Bake at gas mark 4');
  });

  it('does not mangle numbers that are not temperatures', () => {
    expect(convertTemperatures('Cook for 350 minutes', 'metric')).toBe('Cook for 350 minutes');
    expect(convertTemperatures('Add 200 g of flour', 'imperial')).toBe('Add 200 g of flour');
  });

  it('leaves text unchanged when already in the target system', () => {
    expect(convertTemperatures('Bake at 180°C', 'metric')).toBe('Bake at 180°C');
  });
});
