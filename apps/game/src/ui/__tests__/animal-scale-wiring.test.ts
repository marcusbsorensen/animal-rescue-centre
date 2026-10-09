import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SPECIES_UNIT } from '@arc/game-logic';

/**
 * Phaser, stubbed away — same reason as
 * `src/driving/__tests__/crate-loading-view.test.ts`. Reading
 * `SPECIES_SIZE` means importing the view, the view reaches `ui/UIButton`,
 * and Phaser probes a canvas the moment it loads. jsdom has none, so the
 * probe throws before a test runs.
 */
vi.mock('phaser', () => ({ default: {} }));

import { SPECIES_SIZE } from '../../driving/crate-loading-view';
import { ANIMAL_SPRITE_BOUNDS_COUNT, animalSpriteBounds } from '../animal-sprite-bounds';

const SRC = path.join(__dirname, '../..');

/**
 * Call sites that may leave the scale question open, and why.
 *
 * **This list is the debt, written down.** Everything else in `apps/game/src`
 * has to say at the call site whether its animals are drawn beside each other
 * or alone, because that claim is the only thing standing between this game
 * and a hedgehog the size of a dog — which is what six screens drew until the
 * scale ladder was wired through.
 */
const UNANSWERED: Record<string, string> = {
  // Ten call sites, all of them "the animal fills the box this screen already
  // worked out for her": a crate, a bay, a shelf preview, or a cell in the
  // loose row, which sizes itself from `SPECIES_SIZE` before it ever reaches
  // the sprite layer. The default is right for every one of them, so nothing
  // here is drawn wrong — but the file was being rewritten by somebody else
  // while the ladder went in, so the claims are not yet written down.
  'driving/crate-loading-view.ts':
    'owned by the crate-loading work in flight; sizes its own boxes from SPECIES_SIZE',
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `dev/` is the review harness, whose whole job is to draw both modes
      // side by side; it passes the mode as a parameter and no child sees it.
      if (entry.name === '__tests__' || entry.name === 'dev') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The whole `createAnimalSprite(...)` call that starts at `from`. */
function callText(src: string, from: number): string {
  let depth = 0;
  for (let i = src.indexOf('(', from); i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return src.slice(from);
}

/** Every `createAnimalSprite(...)` call in the game source, with its arguments. */
function callSites(): { file: string; line: number; text: string }[] {
  const found: { file: string; line: number; text: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(SRC, file);
    // The declaration lives here; it is not a call.
    if (rel === path.join('ui', 'sprites.ts')) continue;
    const src = fs.readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/createAnimalSprite\(/g)) {
      const at = m.index ?? 0;
      found.push({
        file: rel,
        line: src.slice(0, at).split('\n').length,
        text: callText(src, at),
      });
    }
  }
  return found;
}

describe('the scale claim is made at the call site', () => {
  const sites = callSites();

  it('finds the call sites at all, so a silent zero cannot pass this file', () => {
    expect(sites.length).toBeGreaterThan(15);
  });

  it('has every call site say whether its animals are compared', () => {
    const open = sites
      .filter((s) => !/scale:\s*'(species|fill)'/.test(s.text))
      .filter((s) => UNANSWERED[s.file] === undefined)
      .map((s) => `${s.file}:${s.line}`);
    expect(open).toEqual([]);
  });

  it('keeps the exemption list honest — no entry for a file that has none', () => {
    const files = new Set(sites.map((s) => s.file));
    for (const file of Object.keys(UNANSWERED)) {
      expect(files.has(file), `${file} is exempted but has no call site`).toBe(true);
    }
  });

  it('draws some animals comparatively, which is the whole point', () => {
    const comparative = sites.filter((s) => /scale:\s*'species'/.test(s.text));
    expect(comparative.length).toBeGreaterThanOrEqual(8);
    // The screens that show animals beside one another, by name, so that
    // deleting the claim from one of them fails here rather than quietly.
    const files = new Set(comparative.map((s) => s.file));
    for (const expected of [
      path.join('game-views', 'RoomView.ts'),
      path.join('game-views', 'CorridorView.ts'),
      path.join('game-views', 'GardenView.ts'),
      path.join('game-views', 'ConflictView.ts'),
      path.join('scenes', 'KitchenMinigameScene.ts'),
      path.join('scenes', 'WalkScene.ts'),
    ]) {
      expect(files.has(expected), expected).toBe(true);
    }
  });
});

describe('the two copies of the ladder agree', () => {
  it('matches SPECIES_SIZE rung for rung', () => {
    // `SPECIES_SIZE` is still declared in `crate-loading-view.ts`, which was
    // being rewritten elsewhere when `animal-scale.ts` went in, so the two
    // literals coexist for now. They cannot drift while this passes, and the
    // follow-up is one line: re-export the shared table from there.
    for (const [species, unit] of Object.entries(SPECIES_SIZE)) {
      expect(SPECIES_UNIT[species as keyof typeof SPECIES_UNIT], species).toBe(unit);
    }
  });

  it('adds raccoon and skunk, which SPECIES_SIZE cannot hold', () => {
    expect(Object.keys(SPECIES_SIZE)).not.toContain('raccoon');
    expect(SPECIES_UNIT.raccoon).toBeGreaterThan(0);
    expect(SPECIES_UNIT.skunk).toBeGreaterThan(0);
  });
});

describe('the generated bounds table', () => {
  it('describes the sprite set', () => {
    expect(ANIMAL_SPRITE_BOUNDS_COUNT).toBeGreaterThan(550);
  });

  it('puts every animal inside her own canvas', () => {
    for (const key of ['dog-collie-sheltered', 'hedgehog-brown-sheltered', 'bat-brown-sheltered']) {
      const b = animalSpriteBounds(key);
      expect(b, key).toBeDefined();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.y).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.w).toBeLessThanOrEqual(b!.canvasW);
      expect(b!.y + b!.h).toBeLessThanOrEqual(b!.canvasH);
      expect(b!.w).toBeGreaterThan(0);
      expect(b!.h).toBeGreaterThan(0);
    }
  });

  it('says nothing about a texture that is not an animal sprite', () => {
    expect(animalSpriteBounds('icon-vet-clinic')).toBeUndefined();
  });
});
