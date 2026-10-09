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
import type { Animal, Species } from '@arc/shared-types';

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
  CRATE_DEFS,
  SHELF_CRATES,
  VEHICLE_DEFS,
  bestCrateFor,
  createLoadingSession,
  describePair,
  getCompatibility,
  holdFromTray,
  isCrateSuitable,
  placeHeld,
  putHeldInCrate,
  reseatInto,
  settledNotes,
  type AdjacencyNote,
  type CompatibilityLevel,
  type CrateType,
  type LoadableAnimal,
  type LoadingSession,
  type VehicleType,
} from '@arc/game-logic';
import {
  BAY_FLOOR_MIN, DROP_SLACK, SPECIES_SIZE, WAITING_PAGER_W, activityTitle, bayFloorFor,
  dropTargetsFor, affectedBy, bayHitSize, drawBays, glyphWorthDrawing,
  gridFace, gridFeeling, loadingColumns, looseRow, looseRowScale, nearestDropZone, pairFaces,
  pairOf, pairReactions, panelPadding, plural, setLines, splitLoadingBay, splitTakeaway,
  tileArt, titleCase, whoTravelsIn,
  type CrateLoadingCallbacks,
  type DropZone,
} from '../crate-loading-view';
import {
  BAY_GAP, BAY_MIN, VEHICLE_BED, VEHICLE_BED_SOURCE, fitLoadBed, wholeVehicleHeight,
} from '../fleet-art';
import {
  ARROW_GAP, ARROW_H, ARROW_PAD_BOTTOM, ARROW_W, arrowPlatePadding, carParkBackdropH,
  vehicleParkTop,
} from '../car-park';
import { fitChipGrid } from '../../ui/layout';
import { MIN_TAP, PAGE_MARGIN, SAFE_MARGIN } from '../../ui/constants';

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

describe('a poorly animal, drawn', () => {
  const ill = (species: Species, n: number): LoadableAnimal => ({
    id: `${species}-${n}`, name: `A${n}`, species, poorly: true,
  });

  it('keeps its sick face whoever it is sitting next to', () => {
    // **The whole point of a vet run.** No social expression may
    // paint over it: no override means `createAnimalSprite` derives
    // the state, and the derived state for a poorly animal is `sick`.
    const patient = ill('hedgehog', 1);
    const neighbour = animal('cat', 2);
    const { session } = adjacentPair(patient, neighbour);
    expect(gridFace(session, patient.id)).toBe('sick');
  });

  it('keeps it with no neighbour at all', () => {
    const patient = ill('cat', 1);
    const session = sessionWith('animal-lorry', [{ animal: patient, slot: 0 }]);
    expect(gridFace(session, patient.id)).toBe('sick');
  });

  it('leaves the animal beside it content, never recoiling', () => {
    const patient = ill('bunny', 1);
    const neighbour = animal('bunny', 2);
    const { session, note } = adjacentPair(patient, neighbour);
    expect(note.needsQuiet).toBe(true);
    const [facePatient, faceNeighbour] = pairFaces(note, [patient, neighbour]);
    expect(facePatient, 'the patient looks poorly').toBe('sick');
    expect(faceNeighbour, 'the neighbour looks calm').toBe('walking');
    // And the bay agrees with the panel.
    expect(gridFace(session, neighbour.id)).toBe('walking');
  });

  it('always earns a mark on the edge they share', () => {
    const patient = ill('bunny', 1);
    const neighbour = animal('bunny', 2);
    const { session, note } = adjacentPair(patient, neighbour);
    // Two bunnies would normally be a heart; here the need outranks
    // it, and a need is never one of the pairs left unmarked.
    expect(glyphWorthDrawing(session, note)).toBe(true);
  });

  it('is still frightened of a fox, and the pair still reads as blocked', () => {
    const patient = ill('bunny', 1);
    const fox = animal('fox', 2);
    const { note } = adjacentPair(patient, fox);
    expect(note.level).toBe('blocked');
    expect(note.needsQuiet).toBeFalsy();
    const [facePatient, faceFox] = pairFaces(note, [patient, fox]);
    // Poorly still wins the patient's own face — she is unwell, not
    // merely startled — but the pair is blocked and marked as such.
    expect(facePatient).toBe('sick');
    expect(faceFox).toBe('walking');
  });

  it('does not mind another patient', () => {
    const a = ill('cat', 1);
    const b = ill('dog', 2);
    const { session, note } = adjacentPair(a, b);
    expect(note.level).toBe('happy');
    expect(note.needsQuiet).toBe(false);
    expect(gridFace(session, a.id)).toBe('sick');
    expect(gridFace(session, b.id)).toBe('sick');
  });
});

// ── The emotion belongs to the animal feeling it ─────────────

describe('the word under each animal', () => {
  it('goes to the sufferer and to nobody else', () => {
    // The bug, as a test. The panel used to carry one word for the
    // pair, as its heading, and a heading sits under the left-hand
    // animal — so "Worried" read as belonging to whichever animal
    // happened to be drawn first. Marcus, 2026-10-09: "we have worried
    // but oh Misty, but in fact it's the hedgehog that is worried."
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { note } = adjacentPair(a, b);
        const pair: [LoadableAnimal, LoadableAnimal] = [a, b];
        const hit = affectedBy(note, pair);
        const [wordA, wordB] = pairReactions(note, pair);

        if (note.level === 'happy') {
          // Both are glad of each other, so both say so.
          expect([wordA, wordB], `${sa} + ${sb}`).toEqual(['happy', 'happy']);
          continue;
        }
        expect(wordA, `${sa} beside ${sb}`).toBe(hit.has(a.id) ? note.level : undefined);
        expect(wordB, `${sb} beside ${sa}`).toBe(hit.has(b.id) ? note.level : undefined);
      }
    }
  });

  it('is the same animal the face is on, for every pair of species', () => {
    // The face and the word are two readings of one fact, so they
    // come from one function. A pair where one of them scowls and the
    // other carries the word would be the original bug with an extra
    // step.
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        const { note } = adjacentPair(a, b);
        const pair: [LoadableAnimal, LoadableAnimal] = [a, b];
        const [faceA, faceB] = pairFaces(note, pair);
        const [wordA, wordB] = pairReactions(note, pair);
        const sad = note.level === 'blocked' ? 'scared' : 'grumpy';
        if (note.level === 'happy') continue;
        expect(faceA === sad, `${sa} face`).toBe(wordA !== undefined);
        expect(faceB === sad, `${sb} face`).toBe(wordB !== undefined);
      }
    }
  });

  it('gives two animals with different feelings a word each', () => {
    // A dog beside a cat: the dog is the cause, the cat is worried.
    // One word, under the cat.
    const dog: LoadableAnimal = { id: 'd', name: 'Poppy', species: 'dog' };
    const cat: LoadableAnimal = { id: 'c', name: 'Smokey', species: 'cat' };
    const { note } = adjacentPair(dog, cat);
    expect(note.level).toBe('stressed');
    expect(pairReactions(note, [dog, cat])).toEqual([undefined, 'stressed']);
    // And the other way round in the pair, so the word follows the
    // animal rather than the position.
    const { note: flipped } = adjacentPair(cat, dog);
    expect(pairReactions(flipped, [cat, dog])).toEqual(['stressed', undefined]);
  });

  it('gives the patient the blue word and her neighbour none', () => {
    const patient: LoadableAnimal = {
      id: 'ill', name: 'Truffle', species: 'bunny', poorly: true,
    };
    const neighbour: LoadableAnimal = { id: 'well', name: 'Clover', species: 'bunny' };
    const { note } = adjacentPair(patient, neighbour);
    expect(note.needsQuiet).toBe(true);
    // "Needs quiet" belongs to the animal who needs it. The well
    // animal beside her is being asked to give space, not told she
    // minds — so she wears nothing.
    expect(pairReactions(note, [patient, neighbour])).toEqual(['quiet', undefined]);
  });

  it('never calls a poorly animal happy', () => {
    // Two patients side by side mind each other not at all, which the
    // engine calls happy. Each still wears the word for what she
    // needs, because both are drawn looking poorly.
    const a: LoadableAnimal = { id: 'i1', name: 'Pip', species: 'cat', poorly: true };
    const b: LoadableAnimal = { id: 'i2', name: 'Sage', species: 'cat', poorly: true };
    const { note } = adjacentPair(a, b);
    expect(note.level).toBe('happy');
    expect(pairReactions(note, [a, b])).toEqual(['quiet', 'quiet']);
  });

  it('is still frightened, not merely in need, beside something dangerous', () => {
    const patient: LoadableAnimal = {
      id: 'ill', name: 'Clover', species: 'bunny', poorly: true,
    };
    const fox: LoadableAnimal = { id: 'f', name: 'Rusty', species: 'fox' };
    const { note } = adjacentPair(patient, fox);
    expect(note.level).toBe('blocked');
    expect(pairReactions(note, [patient, fox])).toEqual(['blocked', undefined]);
  });

  it('has a word for every mood it can report', () => {
    // Four feelings, four words, and the set the panel checks a
    // heading against is the same four.
    const words = new Set(
      SPECIES.flatMap((sa) => SPECIES.flatMap((sb) => {
        const a = animal(sa, 1);
        const b = animal(sb, 2);
        return pairReactions(adjacentPair(a, b).note, [a, b]);
      })).filter((m): m is NonNullable<typeof m> => m !== undefined),
    );
    expect([...words].sort()).toEqual(['blocked', 'happy', 'stressed']);
  });
});

// ── The activity title ───────────────────────────────────────

describe('the name of the activity', () => {
  it('is the vehicle’s own name, in capitals', () => {
    expect(activityTitle('Henry')).toBe('LOAD HENRY');
    expect(activityTitle('Big Tilly')).toBe('LOAD BIG TILLY');
  });

  it('names every vehicle in the fleet and calls none of them a van', () => {
    // The bug this is here for: a sentence that said "the van" for
    // Trikey, which is a tricycle, and for Big Tilly, which is a
    // lorry. The title is built, never typed.
    for (const def of Object.values(VEHICLE_DEFS)) {
      const title = activityTitle(def.name);
      expect(title).toBe(`LOAD ${def.name.toUpperCase()}`);
      expect(title).toContain(def.name.toUpperCase());
    }
  });
});

// ── The animals waiting, at their sizes ──────────────────────

describe('the loose animals are sized against each other', () => {
  it('has a size for every species the screen can carry', () => {
    for (const s of SPECIES) {
      expect(SPECIES_SIZE[s], s).toBeGreaterThan(0);
      expect(SPECIES_SIZE[s], s).toBeLessThanOrEqual(1);
    }
  });

  it('puts the big animals above the small ones, in the right order', () => {
    // Not a claim about the numbers — a claim about the order, which
    // is what a child reads off the row. The dog is the largest thing
    // this screen carries and the bat is the smallest.
    const order = [...SPECIES].sort((a, b) => SPECIES_SIZE[b] - SPECIES_SIZE[a]);
    expect(order[0]).toBe('dog');
    expect(order[order.length - 1]).toBe('bat');
    expect(SPECIES_SIZE.hedgehog).toBeLessThan(SPECIES_SIZE.cat);
    expect(SPECIES_SIZE.cat).toBeLessThan(SPECIES_SIZE.dog);
    expect(SPECIES_SIZE.bunny).toBeLessThan(SPECIES_SIZE.fox);
  });

  it('never normalises them to one cell', () => {
    // **The mistake this table exists to stop.** The art is already
    // drawn to a common frame — measured across the set, the opaque
    // part of a sheltered sprite is 0.75 to 0.86 of its file for every
    // species — so two animals drawn into equal boxes come out equal.
    // A hedgehog the size of a dog has been shipped on this project
    // before.
    const { size } = looseRow(
      [SPECIES_SIZE.dog, SPECIES_SIZE.hedgehog, SPECIES_SIZE.bat],
      { w: 600, h: 100 }, 8,
    );
    expect(new Set(size).size, 'three species, three sizes').toBe(3);
    expect(size[0]).toBeGreaterThan(size[1] * 2);
    expect(size[1]).toBeGreaterThan(size[2]);
  });

  it('keeps the proportions when the row has to shrink to fit', () => {
    const units = SPECIES.map((s) => SPECIES_SIZE[s]);
    const roomy = looseRow(units, { w: 4000, h: 100 }, 8);
    const tight = looseRow(units, { w: 300, h: 100 }, 8);
    expect(tight.size[0]).toBeLessThan(roomy.size[0]);
    // Same ratios, within the rounding to whole pixels.
    const ratio = (r: number[]) => r[0] / r[r.length - 1];
    expect(ratio(tight.size)).toBeCloseTo(ratio(roomy.size), 0);
  });

  it('lays the row out left to right from the floor’s own edge', () => {
    // **The premise that changed, 2026-10-09: the gap is no longer
    // always 8.** It used to be exactly `gap` between every pair of
    // drawn edges, and this test said so. The pitch is now floored so
    // that no two grab handles overlap, which means two small animals
    // stand further apart than their drawn edges need — the gap is
    // `>= 8` now, and the pitch is held by the test after this one.
    // Nothing about the direction or the starting edge has moved.
    const { size, cx } = looseRow([1, 0.5, 0.25], { w: 600, h: 100 }, 8);
    expect(cx[0]).toBe(Math.max(size[0], MIN_TAP) / 2);
    for (let i = 1; i < cx.length; i += 1) {
      const gap = (cx[i] - size[i] / 2) - (cx[i - 1] + size[i - 1] / 2);
      expect(gap, `gap before ${i}`).toBeGreaterThanOrEqual(8 - 1e-9);
    }
    // And where the drawn edges alone need more than a handle does, they
    // are what decides it: a dog beside a cat is not pushed apart.
    expect((cx[1] - size[1] / 2) - (cx[0] + size[0] / 2)).toBeCloseTo(8, 5);
  });

  it('never lets two waiting animals’ tap targets overlap', () => {
    // **The fault, and Marcus's decision.** A grab handle is floored at
    // `MIN_TAP` whatever the animal is drawn at, and the pitch was the
    // drawn size plus 8 — so two 30px animals stood 38px apart and
    // shared 14px of target, and a child aiming at the hedgehog picked
    // up the rabbit. The pitch is a full hit box now, so two handles
    // touch and never overlap.
    const units = SPECIES.map((s) => SPECIES_SIZE[s]);
    for (const w of [196, 252, 314, 393, 503, 900]) {
      const { size, cx, page } = looseRow(units, { w, h: 96 }, 8);
      for (let i = 1; i < cx.length; i += 1) {
        if (page[i] !== page[i - 1]) continue;
        expect(cx[i] - cx[i - 1], `pitch before ${i} at ${w}`)
          .toBeGreaterThanOrEqual(MIN_TAP - 1e-9);
        const overlap = (cx[i - 1] + Math.max(size[i - 1], MIN_TAP) / 2)
          - (cx[i] - Math.max(size[i], MIN_TAP) / 2);
        expect(overlap, `handles overlap before ${i} at ${w}`).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('fits every page inside the floor it was given, handles and all', () => {
    const units = SPECIES.map((s) => SPECIES_SIZE[s]);
    for (const w of [196, 252, 314, 393, 503, 900]) {
      const { size, cx, page, rowW } = looseRow(units, { w, h: 96 }, 8);
      expect(rowW, `row at ${w}`).toBeLessThanOrEqual(w);
      for (let i = 0; i < cx.length; i += 1) {
        const half = Math.max(size[i], MIN_TAP) / 2;
        expect(cx[i] - half, `${i} at ${w} left of the floor`).toBeGreaterThanOrEqual(-1e-9);
        // The first animal on a page may be wider than the page: a page
        // with nobody on it is not a page.
        if (i > 0 && page[i] === page[i - 1]) {
          expect(cx[i] + half, `${i} at ${w} past the floor`).toBeLessThanOrEqual(rowW + 1e-9);
        }
      }
    }
  });

  it('comes down three per cent to keep a six-animal queue on one page', () => {
    // 393px is the stacked floor at 820x620, and the screen Marcus
    // signed off. The six-animal row wanted 403 of it once the pitches
    // were floored, so the scale comes down a little rather than the
    // queue splitting in two: the dog goes from 99 to 96.
    const six = (['cat', 'bunny', 'dog', 'hedgehog', 'snake', 'bat'] as Species[])
      .map((s) => SPECIES_SIZE[s]);
    expect(Math.round(looseRowScale(six, 393, 8))).toBe(99);
    const row = looseRow(six, { w: 393, h: 108 }, 8);
    expect(row.pages).toBe(1);
    expect(row.size[2]).toBe(96);
  });

  it('turns a page rather than taking the smallest animal below her art’s floor', () => {
    // A full lorry's eight on that same floor: the width would have the
    // dog at 68 and the bat at 20, and staying on one page would mean
    // another fifth off both — a 54px dog and a 16px bat, which is the
    // thing Marcus said not to trade back. So it pages instead, and
    // then each page has the floor to itself, so the animals go up to
    // what the band's height allows rather than being drawn for a row
    // that is not there. The dog ends up larger than she would have
    // been on one crowded row, not smaller.
    const eight = (['dog', 'fox', 'cat', 'bunny', 'snake', 'parrot', 'hedgehog', 'bat'] as Species[])
      .map((s) => SPECIES_SIZE[s]);
    const row = looseRow(eight, { w: 393, h: 108 }, 8);
    expect(row.pages).toBe(2);
    expect(row.size[0]).toBe(108);
    expect(row.size[7]).toBe(32);
    // Growing stopped at the band's own height, which is the cap it was
    // never going to pass — not at a page turn.
    expect(row.size[0]).toBe(108);
    // Eight animals need at least eight tap targets of floor however
    // small they are drawn, which is why shrinking stops buying places
    // in the row and the pages are the only answer left.
    const tiny = looseRow(eight.map(() => 0.1), { w: 900, h: 96 }, 8);
    expect(tiny.cx[7] - tiny.cx[0]).toBeGreaterThanOrEqual(7 * MIN_TAP - 1e-9);
  });

  it('pages the queue where the floor cannot hold it, and keeps the pages still', () => {
    const units = SPECIES.map((s) => SPECIES_SIZE[s]);
    // The 812pt phone's own floor: 252px, which is five tap targets. The
    // pager takes its width off the row before the pages are worked out,
    // so the last animal on a page never stands under it.
    const phone = looseRow(units, { w: 252, h: 48 }, 8);
    expect(phone.pages).toBeGreaterThan(1);
    expect(phone.rowW).toBe(252 - WAITING_PAGER_W - 8);
    // Every page carries somebody, and the pages run in queue order.
    for (let i = 1; i < phone.page.length; i += 1) {
      const step = phone.page[i] - phone.page[i - 1];
      expect(step, `page step at ${i}`).toBeGreaterThanOrEqual(0);
      expect(step, `page step at ${i}`).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...phone.page)).toBe(phone.pages - 1);
  });

  it('gives back nothing for nobody', () => {
    expect(looseRow([], { w: 500, h: 100 }, 8))
      .toEqual({ size: [], cx: [], page: [], pages: 0, rowW: 500 });
  });
});

// ── The two halves of the loading bay floor ──────────────────

describe('the loading bay floor', () => {
  const FLOORS = {
    'desktop 1024x700': 976,
    'narrow 820x620': 772,
    'landscape phone 874x402': 826,
  };

  it.each(Object.entries(FLOORS))('seats the animals left of the crates at %s', (_l, w) => {
    const { loose, shelf } = splitLoadingBay({ x: 24, y: 400, w, h: 110 });
    expect(loose.x).toBe(24);
    expect(loose.x + loose.w).toBeLessThanOrEqual(shelf.x);
    expect(shelf.x + shelf.w).toBe(24 + w);
    expect(loose.w).toBeGreaterThanOrEqual(MIN_TAP);
  });

  it.each(Object.entries(FLOORS))('leaves the shelf room for six crates at %s', (_l, w) => {
    const { shelf } = splitLoadingBay({ x: 24, y: 400, w, h: 110 });
    // Three across and two down is the narrowest arrangement, so the
    // shelf has to clear three tap targets and two gaps.
    expect(shelf.w).toBeGreaterThanOrEqual(3 * MIN_TAP + 2 * 8);
  });

  it('gives the animals the larger half', () => {
    const { loose, shelf } = splitLoadingBay({ x: 24, y: 400, w: 976, h: 110 });
    expect(loose.w).toBeGreaterThan(shelf.w);
  });
});

// ── Dropping ─────────────────────────────────────────────────

describe('where a drop lands', () => {
  const bay = (slotIndex: number, x: number, y: number): DropZone => ({
    rect: { x, y, w: 48, h: 48 },
    target: { kind: 'bay', slotIndex },
  });

  it('lands in the space it is inside', () => {
    const zones = [bay(0, 100, 100), bay(1, 160, 100)];
    expect(nearestDropZone(zones, 120, 120, DROP_SLACK)).toEqual({ kind: 'bay', slotIndex: 0 });
    expect(nearestDropZone(zones, 180, 120, DROP_SLACK)).toEqual({ kind: 'bay', slotIndex: 1 });
  });

  it('lands in the nearest space when it fell just outside one', () => {
    // The generosity: a child aiming for a bay and releasing twenty
    // pixels short has hit that bay.
    const zones = [bay(0, 100, 100)];
    expect(nearestDropZone(zones, 100, 80, DROP_SLACK)).toEqual({ kind: 'bay', slotIndex: 0 });
    expect(nearestDropZone(zones, 90, 90, DROP_SLACK)).toEqual({ kind: 'bay', slotIndex: 0 });
  });

  it('lands nowhere when it fell well clear of everything', () => {
    expect(nearestDropZone([bay(0, 100, 100)], 400, 400, DROP_SLACK)).toBeNull();
    expect(nearestDropZone([], 100, 100, DROP_SLACK)).toBeNull();
  });

  it('never takes a drop away from the space it is inside', () => {
    // **What makes the slack safe.** Distance is measured to the edge
    // of each space, so a point inside one is zero from it and no
    // other space can beat that however generous the slack is.
    const zones = [bay(0, 100, 100), bay(1, 148, 100), bay(2, 100, 148)];
    for (const slack of [0, 8, 28, 80, 400]) {
      expect(nearestDropZone(zones, 124, 124, slack), `slack ${slack}`)
        .toEqual({ kind: 'bay', slotIndex: 0 });
    }
  });

  it('lets a loose animal go in a crate and nowhere else', () => {
    // Stage one before stage two. The bays are not targets for an
    // animal who has no crate yet, so a drag toward one goes home
    // rather than being refused after the fact.
    const accepts = dropTargetsFor('loose-animal');
    expect(accepts({ kind: 'crate', crate: 'quiet' })).toBe(true);
    expect(accepts({ kind: 'bay', slotIndex: 0 })).toBe(false);
    expect(accepts({ kind: 'floor' })).toBe(false);
  });

  it('lets a crated animal go anywhere there is to go', () => {
    const accepts = dropTargetsFor('crated-animal');
    expect(accepts({ kind: 'bay', slotIndex: 3 })).toBe(true);
    expect(accepts({ kind: 'crate', crate: 'standard' })).toBe(true);
    expect(accepts({ kind: 'floor' })).toBe(true);
  });

  it('sends a loose animal home from a bay she was dragged to', () => {
    const zones: DropZone[] = [
      { rect: { x: 100, y: 100, w: 48, h: 48 }, target: { kind: 'bay', slotIndex: 0 } },
      { rect: { x: 400, y: 300, w: 68, h: 68 }, target: { kind: 'crate', crate: 'quiet' } },
    ];
    const allowed = zones.filter((z) => dropTargetsFor('loose-animal')(z.target));
    expect(nearestDropZone(allowed, 120, 120, DROP_SLACK)).toBeNull();
    expect(nearestDropZone(allowed, 430, 330, DROP_SLACK))
      .toEqual({ kind: 'crate', crate: 'quiet' });
  });

  it('prefers a crate under the pointer to the floor it sits on', () => {
    const zones: DropZone[] = [
      { rect: { x: 0, y: 0, w: 400, h: 100 }, target: { kind: 'floor' } },
      { rect: { x: 420, y: 0, w: 60, h: 60 }, target: { kind: 'crate', crate: 'quiet' } },
    ];
    expect(nearestDropZone(zones, 450, 30, DROP_SLACK))
      .toEqual({ kind: 'crate', crate: 'quiet' });
    expect(nearestDropZone(zones, 200, 50, DROP_SLACK)).toEqual({ kind: 'floor' });
  });
});

// ── The crate shelf ──────────────────────────────────────────

describe('what the shelf says about a crate', () => {
  /**
   * The plurals, written out — a second, independent reading of
   * `plural`, which is the pattern the rest of this file uses for
   * anything the screen says out loud. A fox is foxes and a bunny is
   * bunnies, and the first version of that function said "foxs".
   */
  const PLURAL: Record<Species, string> = {
    cat: 'cats', dog: 'dogs', fox: 'foxes', bunny: 'bunnies',
    bat: 'bats', parrot: 'parrots', snake: 'snakes', hedgehog: 'hedgehogs',
  };

  it('spells every plural the way English does', () => {
    for (const s of SPECIES) expect(plural(s), s).toBe(PLURAL[s]);
  });

  it('names the species that crate suits, and only those', () => {
    for (const crate of SHELF_CRATES) {
      const line = whoTravelsIn(crate);
      for (const s of SPECIES) {
        // No species' plural is a substring of another's, so a plain
        // containment check is exact here.
        expect(line.includes(PLURAL[s]), `${crate} / ${s}`).toBe(isCrateSuitable(s, crate));
      }
    }
  });

  it('reads as a sentence, not a list of ids', () => {
    expect(whoTravelsIn('perch-carrier')).toBe('For parrots.');
    expect(whoTravelsIn('warm-vivarium')).toBe('For snakes.');
    expect(whoTravelsIn('secure')).toBe('For dogs and foxes.');
  });

  it('offers every crate the game has', () => {
    expect([...SHELF_CRATES].sort()).toEqual((Object.keys(CRATE_DEFS) as CrateType[]).sort());
  });

  it('offers at least one crate that does not suit, for every species', () => {
    // The choice has to be a choice. A species for whom every crate on
    // the shelf was suitable would have nothing to get right.
    for (const s of SPECIES) {
      const wrong = SHELF_CRATES.filter((c) => !isCrateSuitable(s, c));
      expect(wrong.length, `${s} has something to choose`).toBeGreaterThan(0);
      const right = SHELF_CRATES.filter((c) => isCrateSuitable(s, c));
      expect(right.length, `${s} has somewhere to go`).toBeGreaterThan(0);
      expect(right).toContain(bestCrateFor(s));
    }
  });
});

// ── Marcus's typesetting rules, as code ──────────────────────

describe('headings in title case', () => {
  it('capitalises the first character, not the first lowercase one', () => {
    // The bug this exists for turned "Henry is empty" into "HEnry Is
    // Empty" — a regex that found the first lowercase letter *inside*
    // the word.
    expect(titleCase('Henry is empty')).toBe('Henry Is Empty');
    expect(titleCase('Big Tilly is empty')).toBe('Big Tilly Is Empty');
  });

  it('leaves his small words small, unless they lead or end', () => {
    expect(titleCase('Nobody is worried')).toBe('Nobody Is Worried');
    expect(titleCase('Wait a moment')).toBe('Wait a Moment');
    expect(titleCase('in your hands: pip the bat')).toBe('In Your Hands: Pip the Bat');
    // Last word, so it is capitalised even though it is on the list.
    expect(titleCase('somewhere to')).toBe('Somewhere To');
  });

  it('does not touch a word the rules already capitalised', () => {
    expect(titleCase('A.R.C. is open')).toBe('A.R.C. Is Open');
  });
});

describe('the takeaway is one sentence, not one line', () => {
  it('splits a two-sentence note after the first full stop', () => {
    expect(splitTakeaway(
      'Pepper the cat makes Bracken the hedgehog worried.'
      + ' Bracken would be happier a space away.',
    )).toEqual([
      ['Pepper the cat makes Bracken the hedgehog worried.'],
      ['Bracken would be happier a space away.'],
    ]);
  });

  it('leaves a single sentence whole, with nothing after it', () => {
    expect(splitTakeaway('Tap to pick them up.')).toEqual([['Tap to pick them up.'], []]);
  });
});

describe('the lines a paragraph is set in', () => {
  // One character is one unit wide — the rules under test are about
  // which words land on which line, not about the face.
  const measure = (s: string): number => s.length;

  it('never leaves a single word on the last line', () => {
    const lines = setLines(measure, 'one two three four five six sevenlong', 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[lines.length - 1].split(' ').length).toBeGreaterThan(1);
  });

  it('never ends a line on a one-letter word', () => {
    const lines = setLines(measure, 'give them a quiet space to travel in today', 18);
    for (const line of lines.slice(0, -1)) {
      const last = line.split(' ').pop() as string;
      expect(last.replace(/[^A-Za-z]/g, '').length).toBeGreaterThan(1);
    }
  });

  it('never starts a line with bare punctuation', () => {
    for (const line of setLines(measure, 'alpha bravo charlie , delta echo foxtrot', 14)) {
      expect(/^[^A-Za-z0-9]/.test(line)).toBe(false);
    }
  });

  it('loses no words and keeps their order', () => {
    const text = 'Animals only mind who is beside them, above them or below them.';
    expect(setLines(measure, text, 24).join(' ')).toBe(text);
  });

  it('gives back nothing for nothing', () => {
    expect(setLines(measure, '', 100)).toEqual([]);
  });

  it('fixes a one-letter line end the runt fix has just created', () => {
    // **The three rules undo each other and the pass has to repeat.**
    // Greedy gives "…happier a space / away."; the runt fix pulls
    // "space" down to keep "away." company and leaves "a" at the end
    // of the line it came from — which the single one-letter pass,
    // running first, had already gone past. This is the sentence that
    // found it, at the 820-wide column.
    const lines = setLines(
      (s) => s.length, 'Smokey would be happier a space away.', 26,
    );
    for (const line of lines.slice(0, -1)) {
      const last = line.split(' ').pop() as string;
      expect(last.replace(/[^A-Za-z]/g, '').length, line).toBeGreaterThan(1);
    }
    expect(lines[lines.length - 1].split(' ').length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('Smokey would be happier a space away.');
  });
});

// ── The sentences, set at the widths they are set at ─────────

describe('every sentence the rules write can be set', () => {
  /**
   * The panel's inner width at each viewport the screen is checked at
   * — `readW - CHROME.padX * 2`, with `readW` as
   * `renderCrateLoading` computes it.
   */
  const COLUMNS = {
    'desktop 1024': 374,
    'a tall 874': 311,
    'narrow 820': 288,
    // The short layout's reading column, which is narrower because the
    // crates stand in a rack of their own beside it: `readShortW` less
    // `CHROME.padX * 2`, at the two phone widths. Added 2026-10-09 with
    // the short layout — the list only ever grows.
    'landscape phone 874': 278,
    'landscape phone 812': 216,
  };

  /**
   * A character is 8.6px wide.
   *
   * The real measure is the live Phaser text object, which this
   * cannot be. 8.6 is a shade wider than `FONTS.ui` runs at 18px, so
   * every line breaks a little earlier here than it does on screen —
   * the test is stricter than the thing it stands for, which is the
   * right way round for an approximation. The screenshots are the
   * check on the face itself.
   */
  const measure = (s: string): number => s.length * 8.6;

  /** Every sentence `describePair` can write, for every pair. */
  const everySentence = (): string[] => {
    const out: string[] = [];
    for (const sa of SPECIES) {
      for (const sb of SPECIES) {
        for (const ill of [false, true]) {
          const a: LoadableAnimal = { id: '1', name: 'Clementine', species: sa, poorly: ill };
          const b: LoadableAnimal = { id: '2', name: 'Pip', species: sb };
          out.push(describePair(a, b).text);
        }
      }
    }
    return out;
  };

  it.each(Object.entries(COLUMNS))('sets every pair cleanly at %s', (_label, width) => {
    for (const sentence of everySentence()) {
      // The panel splits a note at the first full stop and sets the
      // two halves as separate blocks, so each half is measured on
      // its own — exactly as `drawPanel` does it.
      for (const half of splitTakeaway(sentence).flat()) {
        const lines = setLines(measure, half, width);
        expect(lines.join(' '), half).toBe(half);
        for (const line of lines.slice(0, -1)) {
          const last = line.split(' ').pop() as string;
          expect(last.replace(/[^A-Za-z]/g, '').length, `"${line}" in "${half}"`)
            .toBeGreaterThan(1);
        }
        const last = lines[lines.length - 1];
        if (lines.length > 1) {
          expect(last.split(' ').length, `runt in "${half}"`).toBeGreaterThan(1);
        }
        for (const line of lines.slice(1)) {
          expect(/^[^A-Za-z0-9]/.test(line), `punctuation leads "${line}"`).toBe(false);
          // **No negation stranded at a line start.** "…but Cleo will
          // / not enjoy the journey" is the break that sent the
          // wording back to be rewritten; nothing the rules write may
          // open a line on one of these again.
          const first = line.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
          expect(['not', 'never', 'cannot'], `"${line}" in "${half}"`).not.toContain(first);
        }
      }
    }
  });
});

// ── The page grid, in both of its shapes ─────────────────────

describe('where the loading screen puts everything', () => {
  /**
   * The chrome the layout is handed, measured in Chrome off the running
   * screen: the title plate is 81px tall including its shadow, so
   * `contentTopFor` returns 97.5, and the bottom row of buttons takes
   * `EDGE_CONTROL_INSET + MIN_TAP / 2 + SPACE.l` = 80.
   */
  const CONTENT_TOP = 97.5;
  const TITLE_HALF_W = 120;
  const chromeFor = (width: number, height: number) => ({
    width,
    height,
    contentTop: CONTENT_TOP,
    contentBottom: height - 80,
    titleHalfW: TITLE_HALF_W,
    units: (['cat', 'bunny', 'dog', 'hedgehog', 'snake', 'bat'] as Species[])
      .map((s) => SPECIES_SIZE[s]),
  });
  const at = (width: number, height: number) => loadingColumns(chromeFor(width, height));

  const FLEET = Object.values(VEHICLE_DEFS);
  /** The box the car park fits the vehicle in, as `renderCrateLoading` builds it. */
  const vehicleBox = (cols: ReturnType<typeof loadingColumns>) => {
    const backdropH = carParkBackdropH(cols.park.h);
    return { w: cols.vehicleW, h: backdropH > 0 ? cols.park.h - backdropH : cols.park.h };
  };
  const floorFor = (cols: ReturnType<typeof loadingColumns>, v: typeof FLEET[number]) =>
    bayFloorFor(v.id, v.cols, v.rows, cols.groundH);
  const parkedNose = (cols: ReturnType<typeof loadingColumns>, v: typeof FLEET[number]) => {
    const fit = fitLoadBed(
      vehicleBox(cols), VEHICLE_BED_SOURCE[v.id], VEHICLE_BED[v.id], v.cols, v.rows,
      { minSlot: floorFor(cols, v) },
    );
    const top = vehicleParkTop(cols.park, fit.spriteH);
    return { top, bottom: top + fit.spriteH, fit };
  };
  /** Every viewport the game ships to, shortest last. */
  const SHIPPED: Array<[number, number]> = [
    [1024, 768], [1024, 700], [820, 620], [874, 402], [812, 375], [812, 325],
  ];

  it('is stacked on every viewport the screen is composed for, and short on a phone', () => {
    expect(at(1024, 768).kind).toBe('stacked');
    expect(at(1024, 700).kind).toBe('stacked');
    expect(at(820, 620).kind).toBe('stacked');
    expect(at(874, 402).kind).toBe('short');
    expect(at(812, 375).kind).toBe('short');
    expect(at(812, 325).kind).toBe('short');
  });

  it('changes shape at the height where the smallest vehicle stops fitting', () => {
    // **The breakpoint is derived, not chosen.** It is the height at
    // which the stacked column, less the ground the vehicle is owed,
    // falls under the least any vehicle in the fleet needs to stand
    // whole with her bays at the tap floor — Henry's 255. At the title
    // plate this screen draws, that lands on 599.
    expect(Math.round(wholeVehicleHeight('small-van', 2, 2))).toBe(255);
    expect(at(1024, 599).kind).toBe('stacked');
    expect(at(1024, 598).kind).toBe('short');
  });

  it('stands every vehicle whole in the column it hands out, at every supported size', () => {
    // Rule 8, as arithmetic: nothing cropped, at any size the game
    // ships to, **including the two phone viewports that used to cut
    // three of the five.** What bought it is the bay floor coming down
    // where there is no room for 40 — the two tests after this one.
    for (const [w, h] of SHIPPED) {
      const cols = at(w, h);
      for (const v of FLEET) {
        const { top, bottom } = parkedNose(cols, v);
        expect(top, `${v.name} rear at ${w}x${h}`).toBeGreaterThanOrEqual(SAFE_MARGIN);
        expect(bottom, `${v.name} nose at ${w}x${h}`)
          .toBeLessThanOrEqual(cols.park.y + cols.park.h + 0.5);
      }
    }
  });

  it('crops nothing at any viewport height from the web clip to the tablet', () => {
    // The six sizes above are the ones the game is composed for; this
    // walks every height between them, because what used to crop was an
    // arithmetic edge rather than a chosen viewport. It catches the two
    // pixels Spark was short of at 599 and 600 — the stacked heights
    // just above the short layout's breakpoint — which no named
    // viewport sits on and nobody had measured.
    for (let h = 325; h <= 768; h += 1) {
      const cols = at(h >= 599 ? 1024 : 812, h);
      for (const v of FLEET) {
        const { bottom } = parkedNose(cols, v);
        expect(bottom, `${v.name} nose at ${h} tall`)
          .toBeLessThanOrEqual(cols.park.y + cols.park.h + 0.5);
      }
    }
  });

  it('keeps the bays at 40px wherever 40px fits, and relaxes them nowhere else', () => {
    // **Marcus's decision, 9 October 2026, and the arithmetic it rests
    // on.** `BAY_MIN` is the drawn size at which two bays' hit areas
    // stop overlapping, and it holds at every viewport the screen was
    // composed for. It cannot hold on the two phone viewports: Spark
    // needs 361px drawn for her six bays to reach it, and the short
    // layout has 343px of ground at 812x375 and 293 at 812x325. So the
    // bays come down there — only there, only on the vehicles who need
    // it, and only as far as standing her whole requires.
    expect(Math.round(wholeVehicleHeight('electric-minibus', 2, 3))).toBe(361);
    for (const [w, h] of [[1024, 768], [1024, 700], [820, 620], [874, 402]]) {
      for (const v of FLEET) {
        expect(floorFor(at(w, h), v), `${v.name} at ${w}x${h}`).toBe(BAY_MIN);
      }
    }
    // The Capacitor app: Spark alone, and 37 is the largest floor that
    // stands her in 343px of ground.
    expect(Object.fromEntries(FLEET.map((v) => [v.id, floorFor(at(812, 375), v)]))).toEqual({
      'pedal-trike': 40,
      'small-van': 40,
      'long-van': 40,
      'animal-lorry': 40,
      'electric-minibus': 37,
    });
    // The Home Screen web clip, 50px shorter: three of the five, and
    // Spark's 31 is `BAY_FLOOR_MIN` — the lowest number any screen the
    // game ships to ever asks for, which is why it is the clamp.
    expect(Object.fromEntries(FLEET.map((v) => [v.id, floorFor(at(812, 325), v)]))).toEqual({
      'pedal-trike': 40,
      'small-van': 40,
      'long-van': 35,
      'animal-lorry': 37,
      'electric-minibus': BAY_FLOOR_MIN,
    });
    expect(BAY_FLOOR_MIN).toBe(31);
  });

  it('puts the threshold where 40px stops fitting, and never goes under the clamp', () => {
    // Derived, not chosen: the short layout hands the car park
    // `height - 2 * SAFE_MARGIN` of ground, and the first vehicle to
    // lose the 40px floor is the one who needs the most of it. Spark's
    // 361 plus two safe margins is 393, so every vehicle keeps 40 at
    // 393 and she is the first to give a pixel up at 392.
    const floors = (w: number, h: number) => FLEET.map((v) => floorFor(at(w, h), v));
    expect(floors(812, 393)).toEqual([40, 40, 40, 40, 40]);
    expect(Math.min(...floors(812, 392))).toBe(39);
    // And the clamp holds on a viewport nobody has composed for, rather
    // than handing back a bay a crate cannot be seen in.
    expect(Math.min(...floors(812, 240))).toBe(BAY_FLOOR_MIN);
  });

  it('does not let the bay floor move the page grid’s own breakpoint', () => {
    // The shape may not change when an arrow changes the vehicle, and
    // `FLEET_MIN_WHOLE_H` is measured at `BAY_MIN` for exactly that
    // reason. A relaxed floor fed back into the breakpoint would move
    // it — these are the two heights either side of it, unmoved.
    expect(at(1024, 599).kind).toBe('stacked');
    expect(at(1024, 598).kind).toBe('short');
  });

  it('relaxes the drop bays and nothing else, on the smallest screen there is', () => {
    // **The concession is the drop bays' and no other control's.** At
    // 812x325 three vehicles' bays go under `BAY_MIN`, and every other
    // target on the screen still clears `MIN_TAP`: the vehicle arrows,
    // the crates' pitch in their rack, the waiting animals' pitch on
    // the floor. A bay's own hit area is the pitch rather than 48, so it
    // still never overlaps its neighbour — which is what the floor was
    // ever for.
    const cols = at(812, 325);
    const bays = FLEET.map((v) => parkedNose(cols, v).fit);
    expect(Math.min(...bays.map((f) => Math.min(f.slotW, f.slotH)))).toBeLessThan(BAY_MIN);
    for (const fit of bays) {
      expect(bayHitSize(fit.slotW)).toBeLessThanOrEqual(fit.slotW + BAY_GAP);
      expect(bayHitSize(fit.slotH)).toBeLessThanOrEqual(fit.slotH + BAY_GAP);
      expect(fit.slotW).toBeGreaterThanOrEqual(BAY_FLOOR_MIN);
      expect(fit.slotH).toBeGreaterThanOrEqual(BAY_FLOOR_MIN);
    }

    // The arrows keep their whole plate, which is twice the floor.
    expect(ARROW_W).toBeGreaterThanOrEqual(MIN_TAP * 2);
    expect(ARROW_H).toBeGreaterThanOrEqual(MIN_TAP * 2);
    expect(cols.park.w - cols.vehicleW).toBe(2 * (ARROW_W + ARROW_GAP));

    // The crates in their rack, and the animals on their floor.
    const grid = fitChipGrid(
      SHELF_CRATES.length,
      { w: cols.shelf.w, h: cols.shelf.h - cols.labelH - 8 },
      { gap: BAY_GAP, maxW: 76, maxH: 76 },
    );
    expect(grid.chipW + BAY_GAP).toBeGreaterThanOrEqual(MIN_TAP);
    expect(grid.chipH + BAY_GAP).toBeGreaterThanOrEqual(MIN_TAP);
    const row = looseRow(
      (['cat', 'bunny', 'dog', 'hedgehog', 'snake', 'bat'] as Species[])
        .map((s) => SPECIES_SIZE[s]),
      { w: cols.loose.w, h: cols.loose.h - cols.labelH - 8 },
      BAY_GAP,
    );
    for (let i = 1; i < row.cx.length; i += 1) {
      if (row.page[i] !== row.page[i - 1]) continue;
      expect(row.cx[i] - row.cx[i - 1], `animal pitch ${i}`)
        .toBeGreaterThanOrEqual(MIN_TAP - 1e-9);
    }
  });

  it('says which viewports pay for the pitch in page turns, and how many', () => {
    // **What the full hit box costs, size by size.** Six is the cargo
    // the screen is usually photographed with; eight is the largest the
    // fleet can carry, which is Big Tilly's. The number is how many
    // pages the queue takes, so a regression that quietly truncated the
    // row or quietly shrank the animals would move one of them.
    const unitsOf = (cargo: Species[]) => cargo.map((s) => SPECIES_SIZE[s]);
    const SIX = unitsOf(['cat', 'bunny', 'dog', 'hedgehog', 'snake', 'bat']);
    const EIGHT = unitsOf(['dog', 'fox', 'cat', 'bunny', 'snake', 'parrot', 'hedgehog', 'bat']);
    const rowAt = (w: number, h: number, units: number[]) => {
      const cols = loadingColumns({ ...chromeFor(w, h), units });
      return looseRow(units, { w: cols.loose.w, h: cols.loose.h - cols.labelH - 8 }, BAY_GAP);
    };
    const pages = (units: number[]) => SHIPPED.map(([w, h]) => rowAt(w, h, units).pages);
    //                         1024x768 1024x700 820x620 874x402 812x375 812x325
    expect(pages(SIX)).toEqual([1, 1, 1, 1, 2, 2]);
    expect(pages(EIGHT)).toEqual([1, 1, 2, 2, 2, 2]);

    // And the animals stayed large: the dog is a tap target or more at
    // every size, and twice one on anything the screen is stacked on.
    for (const [w, h] of SHIPPED) {
      const dog = rowAt(w, h, SIX).size[2];
      expect(dog, `the dog at ${w}x${h}`).toBeGreaterThanOrEqual(MIN_TAP);
      if (h >= 599) expect(dog, `the dog at ${w}x${h}`).toBeGreaterThanOrEqual(MIN_TAP * 2);
    }
  });

  it('gives the car park the whole height of the screen when it is short', () => {
    const cols = at(874, 402);
    expect(cols.park.y).toBe(SAFE_MARGIN);
    expect(cols.park.h).toBe(402 - 2 * SAFE_MARGIN);
    // And the vehicle is drawn no wider than her bays need, so the
    // arrows keep their room and everything else goes to the reading
    // column and the crates.
    expect(cols.park.w - cols.vehicleW).toBe(2 * (ARROW_W + ARROW_GAP));
  });

  it('keeps the reading column wide enough to set a sentence in, in both shapes', () => {
    for (const [w, h] of [[1024, 768], [1024, 700], [820, 620], [874, 402], [812, 375]]) {
      expect(at(w, h).panel.w, `${w}x${h}`).toBeGreaterThanOrEqual(236);
    }
    // The widths the sentence test above is run at, so the two lists
    // cannot drift apart.
    expect(at(874, 402).panel.w - 36).toBe(278);
    expect(at(812, 375).panel.w - 36).toBe(216);
  });

  it('stays stacked where the screen is too narrow for three columns', () => {
    // 796px of width is what the short layout needs: two page margins,
    // the car park's column (360), two gutters, the crate rack (104)
    // and the narrowest reading column (236). Below it the stacked
    // shape is the lesser fault — a cropped vehicle against a panel too
    // narrow to read. Every viewport this game is composed for is
    // wider: the narrowest is the 812pt phone.
    expect(at(795, 402).kind).toBe('stacked');
    expect(at(796, 402).kind).toBe('short');
  });

  it('never lets two columns overlap, in either shape', () => {
    for (const [w, h] of [[1024, 768], [820, 620], [874, 402], [812, 375]]) {
      const { park, panel, loose, shelf } = at(w, h);
      expect(park.x + park.w, `${w}x${h} park to panel`).toBeLessThanOrEqual(panel.x);
      expect(panel.x + panel.w, `${w}x${h} panel`).toBeLessThanOrEqual(w - PAGE_MARGIN + 0.5);
      expect(shelf.x + shelf.w, `${w}x${h} shelf`).toBeLessThanOrEqual(w - PAGE_MARGIN + 0.5);
      // The animals are always on the side the child reads from and the
      // crates are the next thing along, so the first drag is a short
      // sideways one whichever shape the screen is in.
      expect(loose.x, `${w}x${h} animals left of the crates`).toBeLessThan(shelf.x);
      // The panel is above the animals, never over them.
      if (panel.x === loose.x) {
        expect(panel.y + panel.h, `${w}x${h} panel above the floor`).toBeLessThanOrEqual(loose.y);
      }
    }
  });

  it('ends the animals and the crates on one ground line', () => {
    // They are one floor: a crate twenty pixels above the feet of the
    // animal beside it is two ground lines in one picture.
    for (const [w, h] of [[1024, 768], [820, 620], [874, 402], [812, 375]]) {
      const { loose, shelf } = at(w, h);
      expect(shelf.y + shelf.h, `${w}x${h}`).toBeCloseTo(loose.y + loose.h, 5);
    }
  });

  it('keeps every crate at the tap floor, with no two hit boxes overlapping', () => {
    // **The reason the short layout has a third column.** Six crates
    // need 328px of width in one row or 160x104 in two, and a landscape
    // phone's reading column can give neither: squeezed in beside the
    // animals they come out 27px across, so the 48px hit boxes of two
    // neighbours overlap by 13 and a tap near the edge of one answers
    // for the next. Standing them up in a rack of their own is what
    // keeps all six at the floor.
    for (const [w, h] of [[1024, 768], [1024, 700], [820, 620], [874, 402], [812, 375]]) {
      const { shelf, labelH } = at(w, h);
      const grid = fitChipGrid(
        SHELF_CRATES.length,
        { w: shelf.w, h: shelf.h - labelH - 8 },
        { gap: BAY_GAP, maxW: 76, maxH: 76 },
      );
      // The hit box is floored at MIN_TAP whatever is drawn, so what has
      // to hold is the pitch: two cells a gap apart must be MIN_TAP or
      // more from centre to centre, on both axes.
      expect(grid.chipW + BAY_GAP, `${w}x${h} crate pitch across`).toBeGreaterThanOrEqual(MIN_TAP);
      if (grid.rows > 1) {
        expect(grid.chipH + BAY_GAP, `${w}x${h} crate pitch down`).toBeGreaterThanOrEqual(MIN_TAP);
      }
    }
  });

  it('keeps the waiting animals on a row at least a tap target tall', () => {
    for (const [w, h] of [[1024, 768], [1024, 700], [820, 620], [874, 402], [812, 375]]) {
      const { loose, labelH } = at(w, h);
      expect(loose.h - labelH - 8, `${w}x${h}`).toBeGreaterThanOrEqual(MIN_TAP);
    }
  });

  it('sizes the waiting animals by the floor they have, not by a share of the viewport', () => {
    // The row runs out of floor long before it runs out of height, so
    // the layout asks the width first and gives the band what the row
    // asks for.
    const units = [1, 0.58, 0.74, 0.38, 0.56, 0.3];
    expect(Math.round(looseRowScale(units, 314, BAY_GAP))).toBe(77);
    expect(Math.round(looseRowScale(units, 732, BAY_GAP))).toBe(194);
    expect(looseRowScale([], 300, BAY_GAP)).toBe(0);
  });

  it('leaves more paper under the panel’s words than over them', () => {
    // **Marcus's rule, and the fault it caught.** The panel on the
    // landscape phone had 8px above its heading and 2.5px below its
    // last line, which is the rule inverted and a plate that looks
    // unfinished. On a roomy plate it was 16 above against 8 below,
    // from four pixels of optical offset nobody had written a reason
    // for. Both are gone. Held at every size whose plate is at least as
    // tall as the copy on it; the two that are not are the next test.
    for (const [w, h] of SHIPPED) {
      const { panel } = at(w, h);
      const pad = panelPadding(Math.max(MIN_TAP, panel.h));
      if (panel.h < pad.copyH) continue;
      expect(pad.below, `${w}x${h} below against above`).toBeGreaterThan(pad.above);
    }
    // The landscape phone, measured: the plate is 136.5 where its copy
    // wants 126, so both shares come down and the larger stays under.
    const phone = panelPadding(136.5);
    expect(phone.tight).toBe(true);
    expect(phone.above).toBe(4);
    expect(phone.below).toBe(6.5);
    // A plate with the room asks for its own two numbers and no more.
    const roomy = panelPadding(480, 176);
    expect(roomy.tight).toBe(false);
    expect(roomy.above).toBe(12);
    expect(roomy.below).toBe(480 - 176 - roomy.copyH - 12);
    expect(roomy.below).toBeGreaterThan(roomy.above);
  });

  it('says how far the copy overruns the plate on the 812pt phone, rather than hiding it', () => {
    // **An escalation, pinned so it cannot go quiet.** At 812pt the
    // reading column is `contentBottom - contentTop` — 197.5px in the
    // Capacitor app and 147.5 in the Home Screen web clip — and the
    // floor of waiting animals takes 76 of it before the panel is given
    // anything. What is left is less than the copy, and every lever is
    // already down: the type size does not move, the floor holds one
    // row of tap targets, and the title plate above it takes 97.5px of
    // a 325px screen because the all-caps title is Marcus's own
    // decision. Only he can say what the panel drops.
    //
    // What this holds is that the shortfall shows in the arithmetic —
    // `below` goes negative, and `above` goes to nothing so every pixel
    // there is lands under the words — instead of being spent silently
    // on the bottom padding, which is exactly how the 2.5px happened.
    const app = at(812, 375).panel;
    expect(app.h).toBe(109.5);
    expect(panelPadding(app.h)).toMatchObject({ above: 0, below: -16.5, copyH: 126 });

    const clip = at(812, 325).panel;
    expect(clip.h).toBe(59.5);
    expect(panelPadding(clip.h)).toMatchObject({ above: 0, below: -66.5 });
  });

  it('leaves more paper under a vehicle arrow’s contents than over them', () => {
    // The same inversion, in the other plate this screen draws: the
    // chevron was pinned 36px from the top edge and the two lines of
    // type fell where they fell, leaving 14.6 above and 12 below. Held
    // as a relation, so it survives the plate being resized.
    for (const lines of [1, 2]) {
      const pad = arrowPlatePadding(ARROW_H, lines);
      expect(pad.below, `${lines} line(s): below against above`).toBeGreaterThan(pad.above);
      expect(pad.above, `${lines} line(s): above`).toBeGreaterThanOrEqual(0);
    }
    // At the height the screen draws them the plate has room for both
    // of its own numbers, within a pixel of rounding.
    expect(arrowPlatePadding(ARROW_H, 2).below)
      .toBeGreaterThanOrEqual(ARROW_PAD_BOTTOM - 4);
  });

  it('leaves the tall shape exactly where it was', () => {
    // The two columns and the full-width floor, measured off the
    // running screen at 820x620 and 1024x700 before the short shape
    // existed. Nothing in this work was allowed to move them.
    const narrow = at(820, 620);
    expect(narrow.park).toEqual({ x: 24, y: 97.5, w: 424, h: 294.5 });
    expect(narrow.panel.w).toBe(324);
    expect(narrow.loose.y + narrow.loose.h).toBe(540);
    const desktop = at(1024, 700);
    expect(desktop.park).toEqual({ x: 24, y: 97.5, w: 542, h: 368.5 });
    expect(desktop.panel.w).toBe(410);
  });
});

/**
 * The third load-bearing coupling, added 2026-10-09: **which crate a
 * bay draws.**
 *
 * The screen asks the child to choose a crate and then shows her the
 * load. Those are the same object seen twice, and between the day crate
 * choice shipped and the evening of the same day they disagreed: the
 * bed drew `crateDefFor(crate.species)` — the species default, one
 * design per species — instead of `crate.crateType`, the choice the
 * child had just made and the rules had faithfully stored. A dog put in
 * the secure crate was drawn in a standard one.
 *
 * Nothing was visibly broken, which is why it survived a day of
 * screenshots: every bay held a plausible crate with the right animal
 * in it. What was gone was the consequence of choosing, and an action
 * with no visible result is the one thing this screen may not have.
 *
 * So the bays are drawn here against a scene that records the texture
 * keys it is asked for, and those keys are checked against the crates
 * the session says the animals are in. It is the whole of the drawing
 * this file asserts, and deliberately so — the rest is for the eye and
 * for the screenshots.
 */
interface StubScene {
  /** Every `crate-*` texture the scene was asked to draw, in order. */
  keys: string[];
  /** The `pointerover` handlers the bays registered, in slot order. */
  hovers: Array<() => void>;
  scene: Phaser.Scene;
}

/**
 * A scene that draws nothing and remembers what it was asked to draw.
 *
 * `textures.exists` is true only for the crates, so `createAnimalSprite`
 * takes its coloured-rectangle fallback rather than reaching for art
 * this test has no canvas to hold. The crates are the subject, so the
 * crates are the textures that exist.
 */
function stubScene(): StubScene {
  const keys: string[] = [];
  const hovers: Array<() => void> = [];

  /** An object that answers every drawing call with itself. */
  const chain = (): Record<string, unknown> => {
    const g: Record<string, unknown> = { width: 256, height: 256 };
    for (const m of [
      'fillStyle', 'fillRect', 'fillRoundedRect', 'fillCircle', 'lineStyle',
      'strokeRect', 'strokeRoundedRect', 'strokeCircle', 'beginPath', 'moveTo',
      'lineTo', 'closePath', 'strokePath', 'fillPath', 'setDepth', 'setOrigin',
      'setScale', 'setAlpha', 'setStrokeStyle', 'setDisplaySize', 'setName',
      'setInteractive', 'add', 'setPosition', 'destroy', 'setVisible',
      'setData', 'getData', 'setAngle', 'setTint', 'on',
    ]) {
      g[m] = () => g;
    }
    return g;
  };

  const add = {
    graphics: () => chain(),
    container: () => chain(),
    image: (_x: number, _y: number, key: string) => {
      if (key.startsWith('crate-')) keys.push(key);
      return chain();
    },
    text: (_x: number, _y: number, str: string) => {
      const t = chain();
      // A width `fitLabel` can shrink below any sane maximum, so its
      // ellipsis search terminates instead of spinning.
      t.width = str.length * 7;
      t.setText = (s: unknown) => { t.width = String(s).length * 7; return t; };
      return t;
    },
    rectangle: () => {
      const r = chain();
      r.on = (event: unknown, fn: unknown) => {
        if (event === 'pointerover') hovers.push(fn as () => void);
        return r;
      };
      return r;
    },
  };

  const scene = {
    add,
    textures: { exists: (key: string) => key.startsWith('crate-') },
    tweens: { add: () => undefined },
  } as unknown as Phaser.Scene;

  return { keys, hovers, scene };
}

/** The painted records the bays draw from, for animals built by `animal()`. */
function recordsFor(animals: LoadableAnimal[]): Map<string, Animal> {
  return new Map(animals.map((a) => [a.id, {
    id: a.id,
    name: a.name,
    species: a.species,
    state: 'sheltered',
  } as unknown as Animal]));
}

type PanelBody = { heading: string; body: string[] } | null;

/**
 * Load animals into a vehicle through the real rules — hold, choose a
 * crate, put her in a space — and draw the bays of the result.
 *
 * Through `putHeldInCrate` and `placeHeld` rather than by writing a
 * grid, because the crate type's journey from the child's tap to the
 * `LoadedCrate` is half of what is being asserted here. A grid written
 * by hand would pass this test with the choosing flow unplugged.
 */
function drawLoaded(
  vehicle: VehicleType,
  loaded: Array<{ animal: LoadableAnimal; crate: CrateType; slot: number }>,
): { session: LoadingSession; keys: string[]; hovers: Array<() => void>; messages: PanelBody[] } {
  let session = createLoadingSession(vehicle, loaded.map((l) => l.animal));
  for (const l of loaded) {
    session = putHeldInCrate(holdFromTray(session, l.animal.id), l.crate);
    const out = placeHeld(session, l.slot);
    expect(out.placed, `${l.animal.name} into slot ${l.slot}`).toBe(true);
    session = out.session;
  }
  const drawn = drawBaysOf(session, vehicle, loaded.map((l) => l.animal));
  return { session, ...drawn };
}

/** Draw one session's bays, and hand back what the scene was asked for. */
function drawBaysOf(
  session: LoadingSession,
  vehicle: VehicleType,
  animals: LoadableAnimal[],
): { keys: string[]; hovers: Array<() => void>; messages: PanelBody[] } {
  const def = VEHICLE_DEFS[vehicle];
  const stub = stubScene();
  const messages: PanelBody[] = [];
  drawBays(
    stub.scene,
    stub.scene.add.container(0, 0),
    {
      session,
      vehicle: def,
      destinationName: 'The Vet',
      animalsById: recordsFor(animals),
    },
    {} as unknown as CrateLoadingCallbacks,
    (copy) => messages.push(copy as PanelBody),
    [],
    { active: false },
    { originX: 0, originY: 0, slotW: 120, slotH: 100, cols: def.cols },
  );
  return { keys: stub.keys, hovers: stub.hovers, messages };
}

describe('the bay draws the crate the child chose', () => {
  it('draws the non-default crate when that is the one she picked', () => {
    // A dog's default is the standard crate and the secure crate is the
    // other one she may travel in — a different painting. Keyed on
    // species this drew `crate-standard`, so the child's tap on the
    // secure crate had no visible result anywhere on the screen.
    expect(bestCrateFor('dog')).toBe('standard');
    const { keys } = drawLoaded('small-van', [
      { animal: animal('dog', 1), crate: 'secure', slot: 0 },
    ]);
    expect(keys).toEqual(['crate-secure']);
    expect(keys).not.toContain(`crate-${bestCrateFor('dog')}`);
  });

  it('draws a different crate per bay when two of one species differ', () => {
    // The sharpest form of it: one species, two animals, two crates.
    // Anything keyed on species can only ever draw these two the same,
    // whatever the child did.
    const { keys } = drawLoaded('small-van', [
      { animal: animal('cat', 1), crate: 'quiet', slot: 0 },
      { animal: animal('cat', 2), crate: 'ventilated-basket', slot: 1 },
    ]);
    expect(keys).toEqual(['crate-quiet', 'crate-ventilated-basket']);
  });

  it('draws any of the six, for every species, because any of them can be chosen', () => {
    // Swept, so no species is quietly pinned to its first preference.
    // The shelf offers all six to every animal on purpose — see
    // `SHELF_CRATES` — so every one of the six is a crate the bed has
    // to be able to draw for every one of the eight.
    for (const species of SPECIES) {
      for (const crate of SHELF_CRATES) {
        const { keys } = drawLoaded('pedal-trike', [
          { animal: animal(species, 1), crate, slot: 0 },
        ]);
        expect(keys, `${species} in ${crate}`).toEqual([`crate-${crate}`]);
      }
    }
  });

  it('names the crate she is in, not the one she ought to be in', () => {
    // The hover sentence had the same fault as the picture and is fixed
    // with it: a bay drawn as a secure crate that says "is in a
    // standard crate" is worse than either mistake on its own.
    const { hovers, messages } = drawLoaded('small-van', [
      { animal: animal('dog', 1), crate: 'secure', slot: 0 },
    ]);
    hovers[0]();
    const copy = messages.at(-1);
    expect(copy?.body[0]).toBe(`A1 is in a ${CRATE_DEFS.secure.label.toLowerCase()}.`);
    expect(copy?.body[0]).not.toContain(CRATE_DEFS.standard.label.toLowerCase());
  });

  it('keeps the crate when the load is moved to another vehicle', () => {
    // `reseatInto` promises everybody keeps the crate they are in. The
    // bed is where that promise is visible, so it is checked here as
    // well as in the rules' own tests — a bunny who chose the standard
    // crate must not be redrawn in her species' basket by an arrow.
    const bunny = animal('bunny', 1);
    const { session } = drawLoaded('small-van', [
      { animal: bunny, crate: 'standard', slot: 0 },
    ]);
    expect(bestCrateFor('bunny')).toBe('ventilated-basket');
    const moved = reseatInto(session, 'long-van');
    expect(moved.leftBehind).toEqual([]);
    expect(drawBaysOf(moved.session, 'long-van', [bunny]).keys).toEqual(['crate-standard']);
  });
});
