/**
 * Wardrobe system — pure logic.
 *
 * Each species wears one kind of garment (decided by the shape of the
 * animal — long-bodied snakes wear hats, cats wear scarves around the
 * neck, dogs wear coats over the body). We only have ONE sprite per
 * species (shared across all variants) and use a per-species anchor
 * point to position it correctly on top of the animal sprite at render
 * time — same mechanism as the existing collar system.
 *
 * Anchors can be tuned per-variant later via the admin editor (like
 * the room-anchors.json workflow), but the species-level defaults
 * here are good enough to ship.
 *
 * Everything here is pure — no IO, no mutation. The renderer reads
 * `getWardrobeAnchor()` and composites the garment PNG at that offset.
 */

import type { Species, Weather, Animal } from '@arc/shared-types';
import { needsCoat, isCold } from './weather';

// ── Garment mapping ──────────────────────────────────────────

/**
 * The garment each species wears. One-to-one mapping so the UI can
 * say "Pick a scarf for Whiskers" with the right noun.
 *
 * Design rationale (settled with Marcus):
 * - dog / fox:           coat     — body-covering, warm
 * - cat / bunny / bat:   scarf    — neck-only, easy around ears/wings
 * - parrot / snake:      hat      — head-top, no ears to work around
 */
export type Garment = 'coat' | 'scarf' | 'hat';

const SPECIES_GARMENT: Record<Species, Garment> = {
  dog:    'coat',
  fox:    'coat',
  cat:    'scarf',
  bunny:  'scarf',
  bat:    'scarf',
  parrot: 'hat',
  snake:  'hat',
};

/** The garment type for a species. */
export function getGarmentForSpecies(species: Species): Garment {
  return SPECIES_GARMENT[species];
}

/** Texture key for the species' garment sprite (e.g. "dog-coat"). */
export function getWardrobeTextureKey(species: Species): string {
  return `${species}-${SPECIES_GARMENT[species]}`;
}

// ── Anchor points ────────────────────────────────────────────

/**
 * Where to composite the garment on top of the animal sprite. All
 * coordinates are FRACTIONS of the sprite dimensions so it scales
 * with whatever size the animal is rendered at.
 *
 * - dx / dy:           offset from the sprite centre
 * - widthFrac:         garment width as a fraction of sprite width
 * - heightFrac:        garment height as a fraction of sprite height
 * - rotation:          degrees clockwise (small tilt for draped fabric)
 *
 * Defaults are hand-picked from the reference sprites and can be
 * tuned per-variant via `getWardrobeAnchor(species, variant)` later
 * by reading from public/data/wardrobe-anchors.json — same pattern
 * as the room-anchors workflow.
 */
export interface WardrobeAnchor {
  dx: number;
  dy: number;
  widthFrac: number;
  heightFrac: number;
  rotation: number;
}

/**
 * Species-level defaults. Tuned as a starting point — the in-game
 * admin editor can override per-variant later.
 *
 * Coats sit on the body (large, low, slight body tilt).
 * Scarves sit on the neck (medium, near-top, slight drape rotation).
 * Hats sit on top of the head (small, highest, no rotation).
 */
const DEFAULT_WARDROBE_ANCHORS: Record<Species, WardrobeAnchor> = {
  dog:    { dx: 0.00, dy: 0.05, widthFrac: 0.55, heightFrac: 0.45, rotation: 0 },
  fox:    { dx: 0.00, dy: 0.06, widthFrac: 0.50, heightFrac: 0.40, rotation: 0 },
  cat:    { dx: 0.02, dy: -0.05, widthFrac: 0.35, heightFrac: 0.20, rotation: 8 },
  bunny:  { dx: 0.00, dy: -0.02, widthFrac: 0.40, heightFrac: 0.20, rotation: 5 },
  bat:    { dx: 0.00, dy: -0.08, widthFrac: 0.40, heightFrac: 0.20, rotation: 0 },
  parrot: { dx: 0.00, dy: -0.30, widthFrac: 0.35, heightFrac: 0.30, rotation: 0 },
  snake:  { dx: 0.05, dy: -0.25, widthFrac: 0.25, heightFrac: 0.25, rotation: 0 },
};

/**
 * Look up the wardrobe anchor for a species (and optionally variant).
 *
 * `overrides` is the parsed wardrobe-anchors.json file — if it has a
 * more-specific entry for this (species, variant) it wins; otherwise
 * the species-level override wins; otherwise the built-in default.
 */
export function getWardrobeAnchor(
  species: Species,
  variant?: string,
  overrides?: Record<string, WardrobeAnchor>,
): WardrobeAnchor {
  if (overrides) {
    if (variant) {
      const keyedVariant = `${species}-${variant}`;
      if (overrides[keyedVariant]) return overrides[keyedVariant];
    }
    if (overrides[species]) return overrides[species];
  }
  return DEFAULT_WARDROBE_ANCHORS[species];
}

// ── Equip / unequip ──────────────────────────────────────────

/**
 * Put a garment on an animal. Garment code must match the species'
 * allowed garment (can't put a coat on a snake).
 */
export function equipWardrobe(animal: Animal, garment: Garment): Animal {
  if (SPECIES_GARMENT[animal.species] !== garment) {
    // Silent no-op — caller should ensure species-garment match first
    // via getGarmentForSpecies(). We don't throw because game UI
    // should never present an invalid choice.
    return animal;
  }
  return { ...animal, wardrobe: garment };
}

/** Remove the garment. */
export function unequipWardrobe(animal: Animal): Animal {
  if (!animal.wardrobe) return animal;
  const next = { ...animal };
  delete next.wardrobe;
  return next;
}

// ── Gate helpers ─────────────────────────────────────────────

/**
 * Is the animal properly dressed for the given weather? True if
 * the weather doesn't require a coat, OR the animal has one equipped.
 * Used by the let-outside gate in garden.ts.
 */
export function isDressedForWeather(
  animal: Animal,
  weather: Weather,
): boolean {
  if (!needsCoat(animal, weather)) return true;
  return !!animal.wardrobe;
}

/**
 * User-friendly reason if the animal can't go out due to weather.
 * Returns null if they're dressed appropriately (or no garment needed).
 */
export function dressingBlockReason(
  animal: Animal,
  weather: Weather,
): string | null {
  if (!needsCoat(animal, weather)) return null;
  if (animal.wardrobe) return null;
  const garment = getGarmentForSpecies(animal.species);
  if (isCold(weather)) {
    return `Too cold — ${animal.name} needs a ${garment} before going out.`;
  }
  return `${animal.name} needs a ${garment} in this weather.`;
}
