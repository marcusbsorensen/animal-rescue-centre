import { describe, it, expect } from 'vitest';
import { SPECIES_COLOURS } from '@arc/game-logic';
import { contrastRatio, inkOn, pillFor, INK_DARK, INK_LIGHT } from '../contrast';

/**
 * Name pills are drawn on the species colour. White-on-colour failed the
 * 4.5:1 threshold for six of the eight species (bunny 1.50, cat 2.03,
 * parrot 2.10), which for a 7-year-old reads as "this animal has no name"
 * rather than as a contrast problem. inkOn picks whichever ink is more
 * readable, and this test holds the whole palette to the threshold — a new
 * species with an awkward colour should fail here, not in a child's hands.
 */
describe('contrastRatio', () => {
  it('matches known WCAG endpoints', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 1);
    expect(contrastRatio(0x808080, 0x808080)).toBeCloseTo(1, 5);
  });
});

describe('inkOn, over every species colour', () => {
  const species = Object.entries(SPECIES_COLOURS) as [string, number][];

  it('covers the whole palette', () => {
    expect(species.length).toBeGreaterThanOrEqual(8);
  });

  it.each(species)('%s name pill is legible at 16px bold', (_name, colour) => {
    const { fill, ink } = pillFor(colour);
    const inkInt = Number.parseInt(ink.replace('#', ''), 16);
    // 16px bold is not "large text" under WCAG, so the threshold is 4.5:1.
    expect(contrastRatio(fill, inkInt)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(species)('%s pill keeps the species colour when it can', (_name, colour) => {
    // Only the mid-luminance species (fox, snake, hedgehog) should move at
    // all; the rest must render on their own colour untouched.
    const { fill } = pillFor(colour);
    const legibleAsIs =
      contrastRatio(colour, 0x3a2e22) >= 4.5 || contrastRatio(colour, 0xffffff) >= 4.5;
    if (legibleAsIs) expect(fill).toBe(colour);
  });

  it('still picks white where white is genuinely better', () => {
    expect(inkOn(0x000000)).toBe(INK_LIGHT);
    expect(inkOn(0xffffff)).toBe(INK_DARK);
  });
});
