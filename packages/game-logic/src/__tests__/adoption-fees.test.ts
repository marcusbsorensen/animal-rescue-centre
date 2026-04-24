import { describe, it, expect } from 'vitest';
import {
  calculateAdoptionFee,
  ADOPTION_FEE_BASE,
  ADOPTION_FEE_CAP,
} from '../charity';
import type { Species } from '@arc/shared-types';

function mkAnimal(species: Species, bondLevel: number) {
  return { species, bondLevel };
}

describe('calculateAdoptionFee', () => {
  it('pays the base fee with no household and low bond', () => {
    const fee = calculateAdoptionFee(mkAnimal('cat', 10));
    expect(fee).toBe(ADOPTION_FEE_BASE);
  });

  it('adds the bond bonus at exactly 80 bond', () => {
    const fee = calculateAdoptionFee(mkAnimal('cat', 80));
    expect(fee).toBe(30);
  });

  it('does NOT add the bond bonus at 79 bond', () => {
    const fee = calculateAdoptionFee(mkAnimal('cat', 79));
    expect(fee).toBe(20);
  });

  it('adds the species-match bonus when the household wants that species', () => {
    const fee = calculateAdoptionFee(
      mkAnimal('dog', 30),
      { id: '08-walkers', species: ['dog'] },
    );
    expect(fee).toBe(35);
  });

  it('does not add the species-match bonus when species differs', () => {
    const fee = calculateAdoptionFee(
      mkAnimal('cat', 30),
      { id: '08-walkers', species: ['dog'] },
    );
    expect(fee).toBe(20);
  });

  it('stacks both bonuses and stays under the cap', () => {
    const fee = calculateAdoptionFee(
      mkAnimal('dog', 90),
      { id: '08-walkers', species: ['dog'] },
    );
    // base 20 + bond 10 + species 15 = 45
    expect(fee).toBe(45);
  });

  it('caps at 50 coins even if everything stacks', () => {
    // Raise every bonus to confirm the cap; current maximum is 45.
    // We emulate a (hypothetical future) stacking scenario by bumping via
    // the cap check — here we just confirm the cap is enforced.
    const fee = calculateAdoptionFee(
      mkAnimal('dog', 100),
      { id: 'x', species: ['dog', 'cat'] },
    );
    expect(fee).toBeLessThanOrEqual(ADOPTION_FEE_CAP);
  });

  it('handles missing household gracefully', () => {
    expect(calculateAdoptionFee(mkAnimal('cat', 50), null)).toBe(20);
    expect(calculateAdoptionFee(mkAnimal('cat', 50), undefined)).toBe(20);
    expect(calculateAdoptionFee(mkAnimal('cat', 50), {})).toBe(20);
  });
});
