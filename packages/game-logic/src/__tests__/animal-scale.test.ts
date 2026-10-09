import { describe, it, expect } from 'vitest';
import type { Species } from '@arc/shared-types';
import {
  ANIMAL_CANVAS_CAP,
  ANIMAL_FOOT_BAND,
  SCALED_SPECIES,
  SPECIES_UNIT,
  VARIANT_UNIT,
  animalScaleFraction,
  animalScaleUnit,
  isScaledSpecies,
} from '../animal-scale';
import { HABITAT_EXITS } from '../tunnel';

const SHELTER_SPECIES: Species[] = [
  'cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake', 'hedgehog',
];

describe('the scale ladder', () => {
  it('gives every species in the game a rung', () => {
    for (const s of SHELTER_SPECIES) {
      expect(animalScaleUnit(s), s).toBeGreaterThan(0);
      expect(animalScaleUnit(s), s).toBeLessThanOrEqual(1);
    }
  });

  it('gives the tunnel minigame’s animals a rung too', () => {
    // Raccoon and skunk have ten sprites each and no row in `Species`. They
    // are the tunnel's habitat animals, and this is the assertion that says
    // their art is not drawn dog-sized for want of a number.
    for (const critter of Object.keys(HABITAT_EXITS)) {
      expect(isScaledSpecies(critter), critter).toBe(true);
      expect(animalScaleUnit(critter), critter).toBeGreaterThan(0);
    }
    expect(animalScaleUnit('raccoon')).toBe(0.7);
    expect(animalScaleUnit('skunk')).toBe(0.66);
  });

  it('says nothing rather than guessing for a species with no rung', () => {
    // The whole bug was a missing number being treated as "same as a dog".
    expect(animalScaleUnit('wombat')).toBeUndefined();
    expect(animalScaleFraction('wombat')).toBeUndefined();
    expect(isScaledSpecies('wombat')).toBe(false);
  });

  it('puts the animals in the order a child would', () => {
    expect(animalScaleUnit('dog')).toBe(1);
    const byUnit = [...SCALED_SPECIES].sort(
      (a, b) => SPECIES_UNIT[b] - SPECIES_UNIT[a],
    );
    expect(byUnit).toEqual([...SCALED_SPECIES]);
    expect(SPECIES_UNIT.hedgehog).toBeLessThan(SPECIES_UNIT.cat);
    expect(SPECIES_UNIT.cat).toBeLessThan(SPECIES_UNIT.dog);
    expect(SPECIES_UNIT.bat).toBeLessThan(SPECIES_UNIT.hedgehog);
    expect(SPECIES_UNIT.raccoon).toBeLessThan(SPECIES_UNIT.cat);
    expect(SPECIES_UNIT.skunk).toBeLessThan(SPECIES_UNIT.raccoon);
  });

  it('separates a dog from a bat by more than the art ever did', () => {
    // The art separates its largest species from its smallest by 1.22x at
    // the very widest, measured over all 600 files. The ladder has to do
    // considerably better than that or it is not doing anything.
    expect(SPECIES_UNIT.dog / SPECIES_UNIT.bat).toBeGreaterThan(3);
  });
});

describe('variant scale', () => {
  it('lets a variant differ from its species', () => {
    expect(animalScaleUnit('parrot', 'macaw')).toBe(0.96);
    expect(animalScaleUnit('parrot', 'budgie')).toBe(0.32);
    expect(animalScaleUnit('dog', 'pug')).toBe(0.5);
    expect(animalScaleUnit('fox', 'fennec')).toBe(0.52);
    expect(animalScaleUnit('bunny', 'lionhead')).toBe(0.44);
    expect(animalScaleUnit('bat', 'fruit')).toBe(0.45);
  });

  it('makes a macaw three times a budgie, which one parrot row cannot', () => {
    const macaw = animalScaleUnit('parrot', 'macaw');
    const budgie = animalScaleUnit('parrot', 'budgie');
    expect(macaw! / budgie!).toBeGreaterThan(2.5);
  });

  it('falls back to the species for a variant with no exception', () => {
    // 60 species-variants, eight exceptions. The other 52 inherit, which is
    // the point of keeping the exception list short.
    expect(animalScaleUnit('parrot', 'amazon')).toBe(SPECIES_UNIT.parrot);
    expect(animalScaleUnit('cat', 'ginger')).toBe(SPECIES_UNIT.cat);
    expect(animalScaleUnit('dog', 'collie')).toBe(SPECIES_UNIT.dog);
    expect(animalScaleUnit('hedgehog', 'albino')).toBe(SPECIES_UNIT.hedgehog);
    expect(animalScaleUnit('bat', 'pipistrelle')).toBe(SPECIES_UNIT.bat);
  });

  it('falls back for an unknown variant and for no variant at all', () => {
    expect(animalScaleUnit('dog', 'pekingese')).toBe(SPECIES_UNIT.dog);
    expect(animalScaleUnit('dog')).toBe(SPECIES_UNIT.dog);
    expect(animalScaleUnit('dog', null)).toBe(SPECIES_UNIT.dog);
    expect(animalScaleUnit('dog', '')).toBe(SPECIES_UNIT.dog);
  });

  it('never lets a variant out of the range the cap assumes', () => {
    for (const [key, unit] of Object.entries(VARIANT_UNIT)) {
      expect(unit, key).toBeGreaterThan(0);
      expect(unit, key).toBeLessThanOrEqual(1);
      // A variant exception has to belong to a species that has a rung, or
      // it can never be reached.
      expect(isScaledSpecies(key.split('-')[0]), key).toBe(true);
    }
  });
});

describe('the canvas fraction', () => {
  it('is the unit times the cap', () => {
    expect(animalScaleFraction('dog')).toBeCloseTo(0.8, 6);
    expect(animalScaleFraction('hedgehog')).toBeCloseTo(0.304, 6);
    expect(animalScaleFraction('bat')).toBeCloseTo(0.24, 6);
    expect(animalScaleFraction('raccoon')).toBeCloseTo(0.56, 6);
    expect(animalScaleFraction('parrot', 'macaw')).toBeCloseTo(0.768, 6);
    expect(animalScaleFraction('parrot', 'lovebird')).toBeCloseTo(0.232, 6);
  });

  it('leaves the largest animal headroom and a foot band', () => {
    // Rule 3 wants 10% clear above the head; the cap plus the band has to
    // leave at least that much.
    expect(ANIMAL_CANVAS_CAP).toBeLessThanOrEqual(0.86);
    expect(1 - ANIMAL_CANVAS_CAP - ANIMAL_FOOT_BAND).toBeGreaterThanOrEqual(0.1);
    for (const s of SCALED_SPECIES) {
      expect(animalScaleFraction(s)!, s).toBeLessThanOrEqual(ANIMAL_CANVAS_CAP);
    }
  });
});
