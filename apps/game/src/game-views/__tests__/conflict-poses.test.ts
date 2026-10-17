import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { CONFLICT_TYPES, SPECIES_VARIANTS } from '@arc/game-logic';
import type { Species } from '@arc/shared-types';

/**
 * The faces on the conflict screen.
 *
 * The screen that says "bickering about toys" used to draw both animals
 * sheltered, sleeping or eating — settled, whatever the text said. The
 * mapping is `docs/sprite-pose-spec-2026-09-05.md`, "The conflict screen
 * never asks for its poses"; these pin the table and the art it relies on.
 *
 * Importing the view needs Phaser stubbed (it probes a canvas on import);
 * the table is plain data and nothing here renders.
 */

vi.mock('phaser', () => ({ default: {} }));

const { CONFLICT_POSES } = await import('../ConflictView');

const ANIMALS_DIR = path.join(__dirname, '../../../public/assets/animals');
const SPECIES = Object.keys(SPECIES_VARIANTS) as Species[];

describe('CONFLICT_POSES', () => {
  it('names a pair for every conflict type, and nothing else', () => {
    expect(Object.keys(CONFLICT_POSES).sort())
      .toEqual(CONFLICT_TYPES.map((c) => c.type).sort());
  });

  it('is the table in the pose spec', () => {
    expect(CONFLICT_POSES).toEqual({
      space_sharing:    ['sheltered', 'grumpy'],
      food_jealousy:    ['eating',    'grumpy'],
      noise_complaint:  ['playing',   'sleeping'],
      sibling_squabble: ['growling',  'grumpy'],
    });
  });

  it('never draws a conflict as two settled animals', () => {
    // The bug: all four types were content poses, so nobody looked as if
    // anything was wrong.
    const content = new Set(['sheltered', 'sleeping', 'eating']);
    for (const [type, [a1, a2]] of Object.entries(CONFLICT_POSES)) {
      expect(content.has(a1) && content.has(a2), `${type} is two content poses`).toBe(false);
    }
  });

  it('leaves `scared` to the screens where somebody is frightened', () => {
    // Deliberate: conflicts are mild grumbles, and `scared` is the
    // crate-loading screen's face for a pair that cannot travel together.
    for (const [type, pair] of Object.entries(CONFLICT_POSES)) {
      expect(pair, type).not.toContain('scared');
    }
  });
});

describe('the conflict screen asks for the pose', () => {
  it('draws each animal with exactPose, so a still-loading variant does not settle her', () => {
    // Read from source, because rendering needs a Phaser scene. The
    // behaviour itself is pinned in ui/__tests__/sprites.test.ts; this is
    // only that the screen asks for it.
    const source = fs.readFileSync(path.join(__dirname, '../ConflictView.ts'), 'utf8');
    const calls = [...source.matchAll(/createAnimalSprite\([^)]*\{[^}]*\}/g)];

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/stateOverride:\s*state/);
    expect(calls[0][0]).toMatch(/exactPose:\s*true/);
  });
});

describe('the art the poses ask for', () => {
  const poses = [...new Set(Object.values(CONFLICT_POSES).flat())];

  it.each(poses)('has a species-level %s for every species, which is what is drawn while variants load', (pose) => {
    for (const species of SPECIES) {
      const file = path.join(ANIMALS_DIR, `${species}-${pose}.png`);
      expect(fs.existsSync(file), `${species}-${pose}.png`).toBe(true);
    }
  });

  it.each(poses)('has a %s for every variant of every species', (pose) => {
    for (const species of SPECIES) {
      for (const variant of SPECIES_VARIANTS[species]) {
        const file = path.join(ANIMALS_DIR, `${species}-${variant}-${pose}.png`);
        expect(fs.existsSync(file), `${species}-${variant}-${pose}.png`).toBe(true);
      }
    }
  });
});
