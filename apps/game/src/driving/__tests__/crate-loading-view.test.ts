/**
 * The loading screen's two load-bearing couplings, pinned.
 *
 * The drawing itself is checked by eye and by screenshot; what a test
 * is for here is the two places where a silent mistake would teach a
 * child something false and nothing would go visibly wrong:
 *
 *   1. **Who feels it.** The faces come from `affectedBy`, which reads
 *      the direction back off the sentence `describePair` wrote. If
 *      that wording changes, the view would quietly start drawing the
 *      wrong animal frightened. So this reads the same sentences a
 *      second, independent way — by pattern rather than by prefix —
 *      for every pair of species there is, and insists the two
 *      readings agree.
 *
 *   2. **The tap floor.** The painted bay is now deliberately smaller
 *      than the thing a finger hits, which is exactly the arrangement
 *      that rots: somebody shrinks the picture a little further and
 *      the target goes with it. So the target is asserted against
 *      `MIN_TAP` for every vehicle at every viewport the screen is
 *      checked at.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Species } from '@arc/shared-types';

/**
 * Phaser, stubbed away.
 *
 * Nothing under test here draws anything — these are the screen's
 * arithmetic and its reading of the rules — but the view imports
 * `ui/UIButton`, which imports Phaser, and Phaser probes a canvas the
 * moment it is loaded. jsdom has no canvas, so the probe throws before
 * a single test runs. The stub stands in for the module; the one place
 * UIButton touches `Phaser.*` is inside a function this file never
 * calls.
 */
vi.mock('phaser', () => ({ default: {} }));
import {
  VEHICLE_DEFS,
  bestCrateFor,
  describePair,
  getCompatibility,
  settledNotes,
  type AdjacencyNote,
  type CompatibilityLevel,
  type LoadableAnimal,
  type LoadingSession,
  type VehicleType,
} from '@arc/game-logic';
import {
  affectedBy, bayHitSize, glyphWorthDrawing, gridFeeling, pairFaces, pairOf, tileArt,
} from '../crate-loading-view';
import { VEHICLE_BED, VEHICLE_BED_SOURCE, fitLoadBed } from '../fleet-art';
import { MIN_TAP } from '../../ui/constants';

const SPECIES: Species[] = [
  'cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake', 'hedgehog',
];

const named = (a: LoadableAnimal) => `${a.name} the ${a.species}`;

/** An animal with a name that cannot be confused with any other. */
function animal(species: Species, n: number): LoadableAnimal {
  return { id: `${species}-${n}`, name: `A${n}`, species };
}

/**
 * A grid with the given animals dropped into the given slots.
 *
 * Built by hand rather than through `placeHeld`, because `placeHeld`
 * refuses a frightening neighbour and a frightened pair is half of
 * what this file is about.
 */
function sessionWith(
  vehicle: VehicleType,
  placed: Array<{ animal: LoadableAnimal; slot: number }>,
): LoadingSession {
  const def = VEHICLE_DEFS[vehicle];
  return {
    grid: {
      vehicle,
      cols: def.cols,
      rows: def.rows,
      crates: placed.map((p) => ({
        slotIndex: p.slot,
        animalId: p.animal.id,
        species: p.animal.species,
        crateType: bestCrateFor(p.animal.species),
      })),
    },
    offered: placed.map((p) => p.animal),
    heldId: null,
  };
}

/** Two animals side by side in Henry, and the note about them. */
function adjacentPair(a: LoadableAnimal, b: LoadableAnimal) {
  const session = sessionWith('small-van', [
    { animal: a, slot: 0 }, { animal: b, slot: 1 },
  ]);
  const notes = settledNotes(session);
  expect(notes).toHaveLength(1);
  return { session, note: notes[0] };
}

const ONE_SIDED = /^(.+?) makes (.+?) (worried|frightened)\. /;
const MUTUAL = /^(.+?) and (.+?) (make each other worried|frighten each other)\. /;

/**
 * The direction, read a second way.
 *
 * `affectedBy` tests the start of the sentence; this one picks it
 * apart with a pattern. Two different parses of the same string is the
 * point — a reworded sentence fails here loudly instead of flipping a
 * face silently.
 */
function affectedByPattern(
  note: AdjacencyNote,
  pair: [LoadableAnimal, LoadableAnimal],
): Set<string> {
  if (note.level === 'happy') return new Set();
  const [a, b] = pair;
  const one = note.text.match(ONE_SIDED);
  if (one) {
    const sufferer = [a, b].find((x) => named(x) === one[2]);
    if (!sufferer) throw new Error(`no animal named "${one[2]}" in "${note.text}"`);
    return new Set([sufferer.id]);
  }
  if (note.text.match(MUTUAL)) return new Set([a.id, b.id]);
  throw new Error(`describePair has been reworded: "${note.text}"`);
}

describe('who the panel draws as feeling it', () => {
  it('agrees with the sentence for every pair of species', () => {
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { note } = adjacentPair(a, b);
        const pair: [LoadableAnimal, LoadableAnimal] = [a, b];

        expect([...affectedBy(note, pair)].sort(), `${sa} + ${sb}`)
          .toEqual([...affectedByPattern(note, pair)].sort());
      }
    }
  });

  it('blames nobody when the pair is happy', () => {
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        if (getCompatibility(sa, sb) !== 'happy') continue;
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { note } = adjacentPair(a, b);
        expect(affectedBy(note, [a, b]).size, `${sa} + ${sb}`).toBe(0);
      }
    }
  });

  it('gives the sufferer the face and leaves the cause calm', () => {
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { note } = adjacentPair(a, b);
        const pair: [LoadableAnimal, LoadableAnimal] = [a, b];
        const hit = affectedBy(note, pair);
        const [faceA, faceB] = pairFaces(note, pair);

        if (note.level === 'happy') {
          expect([faceA, faceB]).toEqual(['playing', 'playing']);
          continue;
        }
        const sad = note.level === 'blocked' ? 'scared' : 'grumpy';
        expect(faceA, `${sa} beside ${sb}`).toBe(hit.has(a.id) ? sad : 'walking');
        expect(faceB, `${sb} beside ${sa}`).toBe(hit.has(b.id) ? sad : 'walking');
        // Somebody always feels a pair that is not happy, and the
        // picture would be a lie if nobody did.
        expect(hit.size).toBeGreaterThan(0);
      }
    }
  });
});

describe('what an animal in a bay wears', () => {
  /** The first pair of species with this feeling between them. */
  function pairWith(level: CompatibilityLevel): [Species, Species] {
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        if (getCompatibility(sa, sb) === level) return [sa, sb];
      }
    }
    throw new Error(`no species pair is ${level}`);
  }

  it('is nothing at all for an animal with no neighbours', () => {
    const a = animal('cat', 1);
    const session = sessionWith('animal-lorry', [{ animal: a, slot: 0 }]);
    expect(gridFeeling(session, a.id)).toBeNull();
  });

  it('is nothing for an animal who is only ever the cause', () => {
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        if (getCompatibility(sa, sb) === 'happy') continue;
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { session, note } = adjacentPair(a, b);
        const hit = affectedBy(note, [a, b]);
        if (hit.size !== 1) continue;
        const cause = hit.has(a.id) ? b : a;
        expect(gridFeeling(session, cause.id), `${cause.species} as the cause`).toBeNull();
        return;
      }
    }
    throw new Error('no one-sided pair to check');
  });

  it('takes the worst of several neighbours, as previewPlacement does', () => {
    const [bx, by] = pairWith('blocked');
    const sufferer = animal(by, 1);
    const frightener = animal(bx, 2);
    const friend = animal(by, 3);

    // Henry, 2x2: slot 0 is beside slot 1 and above slot 2.
    const session = sessionWith('small-van', [
      { animal: sufferer, slot: 0 },
      { animal: frightener, slot: 1 },
      { animal: friend, slot: 2 },
    ]);
    // Same species beside each other is the happy case, so this animal
    // has one happy neighbour and one frightening one.
    expect(getCompatibility(by, by)).toBe('happy');
    expect(gridFeeling(session, sufferer.id)).toBe('blocked');
  });
});

describe('the glyph on a shared edge', () => {
  it('marks every pair that is not plainly fine', () => {
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { session, note } = adjacentPair(a, b);
        const worth = glyphWorthDrawing(session, note);

        if (note.level !== 'happy') {
          expect(worth, `${sa} + ${sb} is ${note.level}`).toBe(true);
        } else {
          // Happy and the same species is the pairing the engine pays
          // a bonus for, and the only happy one worth a mark.
          expect(worth, `${sa} + ${sb} is happy`).toBe(sa === sb);
        }
      }
    }
  });

  it('finds the two animals behind every note', () => {
    const a = animal('cat', 1);
    const b = animal('dog', 2);
    const { session, note } = adjacentPair(a, b);
    expect(pairOf(session, note)?.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('the painted bay is smaller than the tap target', () => {
  const COLUMNS = {
    'desktop 1024x700': { w: 524, h: 471 },
    'narrow 820x620': { w: 400, h: 391 },
    'landscape phone 874x402': { w: 431, h: 98 },
  };
  const BAY_NAME_MIN_H = 60;

  it.each(Object.entries(COLUMNS))('keeps every tap at or above MIN_TAP at %s', (_l, box) => {
    for (const v of Object.values(VEHICLE_DEFS)) {
      const fit = fitLoadBed(
        box, VEHICLE_BED_SOURCE[v.id], VEHICLE_BED[v.id], v.cols, v.rows,
      );
      expect(bayHitSize(fit.slotW), `${v.name} tap width`).toBeGreaterThanOrEqual(MIN_TAP);
      expect(bayHitSize(fit.slotH), `${v.name} tap height`).toBeGreaterThanOrEqual(MIN_TAP);
    }
  });

  it.each(Object.entries(COLUMNS))('draws a bigger crate than it used to at %s', (_l, box) => {
    for (const v of Object.values(VEHICLE_DEFS)) {
      const fit = fitLoadBed(
        box, VEHICLE_BED_SOURCE[v.id], VEHICLE_BED[v.id], v.cols, v.rows,
      );
      const art = tileArt({
        left: 0, top: 0, cx: fit.slotW / 2, cy: fit.slotH / 2,
        slotW: fit.slotW, slotH: fit.slotH,
        withName: fit.slotH >= BAY_NAME_MIN_H,
      });
      // The crate never reaches outside its own cell, so two of them
      // side by side cannot touch.
      expect(art.size, `${v.name} crate`).toBeLessThanOrEqual(fit.slotW);
      expect(art.size, `${v.name} crate`).toBeLessThanOrEqual(fit.slotH);
      expect(art.size, `${v.name} crate`).toBeGreaterThan(0);
      // And it is at least as big as it used to be, which is the point
      // of the change: the old card rule was `min(w - 4, h - name - 4)`
      // and the old row rule `min(h - 8, w * 0.34)`.
      const nameRow = fit.slotH >= BAY_NAME_MIN_H ? 20 : 0;
      const before = fit.slotW >= fit.slotH * 1.6
        ? Math.min(fit.slotH - 8, fit.slotW * 0.34)
        : Math.min(fit.slotW - 4, fit.slotH - nameRow - 4);
      expect(art.size, `${v.name} crate vs the old rule`).toBeGreaterThanOrEqual(before);
    }
  });

  it('puts the name above the animal, never below', () => {
    const art = tileArt({
      left: 0, top: 0, cx: 40, cy: 50, slotW: 80, slotH: 100, withName: true,
    });
    expect(art.hasName).toBe(true);
    expect(art.nameY).toBeLessThan(art.cy - art.size / 2);
  });

  it('keeps the name beside the crate in a wide shallow bay', () => {
    const art = tileArt({
      left: 0, top: 0, cx: 66, cy: 26, slotW: 132, slotH: 53, withName: false,
    });
    expect(art.hasName).toBe(true);
    expect(art.nameY).toBe(art.cy);
    expect(art.nameX).toBeGreaterThan(art.cx + art.size / 2);
  });
});

describe('describePair, as this screen reads it', () => {
  it('still writes a sentence naming both animals', () => {
    const a: LoadableAnimal = { id: 'a', name: 'Poppy', species: 'dog' };
    const b: LoadableAnimal = { id: 'b', name: 'Smokey', species: 'cat' };
    const { text } = describePair(a, b);
    // Not an assertion about the wording — `affectedBy`'s whole design
    // is that the wording may change — but a readable example of what
    // it is reading, so the next person can see the shape at a glance.
    expect(text).toContain('Poppy the dog');
    expect(text).toContain('Smokey the cat');
  });
});
