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
 * `getWardrobeAnchor()` and composites the garment PNG at that offset
 * (`apps/game/src/ui/wardrobe-art.ts`, called from `createAnimalSprite`).
 *
 * **What `animal.wardrobe` holds.** A garment name and, after a colon, the
 * colour the child picked: `"coat:#c0392b"`. The colour is a tint — the
 * garment art is drawn in greys and coloured at render time — so it is
 * read, not decoration. A bare `"coat"` (what `equipWardrobe` writes) wears
 * the default colour. `parseWardrobe` / `formatWardrobe` are the only code
 * that should know the shape.
 */

import type { Species, Weather, Animal } from '@arc/shared-types';
import { needsCoat, isCold } from './weather';

// ── Colours ──────────────────────────────────────────────────

/**
 * The colours a child can pick a garment in. These are the tint — the
 * garment art is greys, and `ui/wardrobe-art.ts` maps them onto the hue.
 * The hexes are the six that the picker has always offered, so a save
 * written before the garments were drawn still means what it said.
 */
export const WARDROBE_COLOURS: ReadonlyArray<{ readonly name: string; readonly hex: string }> = [
  { name: 'Rust',    hex: '#c0392b' },
  { name: 'Navy',    hex: '#2c3e50' },
  { name: 'Mustard', hex: '#e3b04b' },
  { name: 'Forest',  hex: '#27ae60' },
  { name: 'Plum',    hex: '#8e44ad' },
  { name: 'Teal',    hex: '#16a085' },
];

/** What a garment with no colour on it (`"coat"`) is worn in. */
export const DEFAULT_WARDROBE_HEX = WARDROBE_COLOURS[0].hex;

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** `#abc` and `#ABCDEF` to `#aabbcc` and `#abcdef`; anything else is null. */
export function normaliseHex(hex: string | undefined | null): string | null {
  if (!hex) return null;
  if (HEX6.test(hex)) return hex.toLowerCase();
  if (HEX3.test(hex)) {
    const [, r, g, b] = hex.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

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
  hedgehog: 'scarf',   // neck-only — a coat would flatten the spines
};

/** The garment type for a species. */
export function getGarmentForSpecies(species: Species): Garment {
  return SPECIES_GARMENT[species];
}

/** Texture key for the species' garment sprite (e.g. "dog-coat"). */
export function getWardrobeTextureKey(species: Species): string {
  return `${species}-${SPECIES_GARMENT[species]}`;
}

/**
 * Species whose garment art has not been drawn yet. **An allow-list that
 * only shrinks**: `apps/game/src/lib/__tests__/wardrobe-art-on-disk.test.ts`
 * fails when a species listed here has its art, and when one not listed
 * here has none.
 *
 * Such a species is not offered a garment, *and is not required to wear
 * one* (`animalNeedsGarment`). The second half matters: the let-outside
 * gate makes a garment mandatory in snow and fog, so offering nothing while
 * still requiring it would leave a hedgehog that can never go into the
 * garden on a cold day and a message telling the child to fetch something
 * that is not in the shop.
 */
export const SPECIES_AWAITING_GARMENT_ART: ReadonlySet<Species> = new Set<Species>(['hedgehog']);

/** Can this species be dressed in this build — is there a garment to put on? */
export function canBeDressed(species: Species): boolean {
  return !SPECIES_AWAITING_GARMENT_ART.has(species);
}

/** What `animal.wardrobe` says: the garment, and the colour if it names one. */
export interface WardrobeCode {
  garment: Garment;
  /** `#rrggbb`, lower case. Absent when the code carries none or a bad one. */
  hex?: string;
}

const GARMENTS: ReadonlyArray<Garment> = ['coat', 'scarf', 'hat'];

/**
 * Read `"coat:#c0392b"`, `"coat"`, or whatever an older build left behind.
 * Null for no garment, and for a name that is not one. A colour that cannot
 * be read is dropped and the garment kept: the child put something on, and
 * `isDressedForWeather` has always counted any non-empty code as dressed.
 */
export function parseWardrobe(code: string | undefined | null): WardrobeCode | null {
  if (!code) return null;
  const [name, colour] = code.split(':');
  const garment = GARMENTS.find((g) => g === name.trim().toLowerCase());
  if (!garment) return null;
  const hex = normaliseHex(colour?.trim());
  return hex ? { garment, hex } : { garment };
}

/** The inverse of `parseWardrobe`. No colour gives the bare garment name. */
export function formatWardrobe(garment: Garment, hex?: string | null): string {
  const h = normaliseHex(hex);
  return h ? `${garment}:${h}` : garment;
}

/** The hex to tint this animal's garment: what she wears, else the default. */
export function wardrobeHex(code: string | undefined | null): string {
  return parseWardrobe(code)?.hex ?? DEFAULT_WARDROBE_HEX;
}

// ── Anchor points ────────────────────────────────────────────

/**
 * Where to composite the garment on top of the animal sprite. All
 * coordinates are FRACTIONS of the sprite dimensions so it scales
 * with whatever size the animal is rendered at.
 *
 * - dx / dy:           offset of the garment's centre from the sprite
 *                      centre, as a fraction of the sprite's width / height
 * - widthFrac:         the box the garment's drawing is fitted into, as a
 *                      fraction of sprite width ...
 * - heightFrac:        ... and of sprite height. The drawing keeps its own
 *                      proportions inside the box.
 * - rotation:          degrees clockwise, about the garment's centre
 * - flip:              mirror the garment left to right before rotating
 *                      (a coat's collar follows the way the head faces)
 * - maskDx / maskDy / maskRadiusFrac:
 *                      a circle, centred as dx/dy are and sized as a fraction
 *                      of sprite width, inside which the garment is erased —
 *                      the head, so a scarf tucks behind it rather than
 *                      lying across her face
 *
 * `public/data/wardrobe-anchors.json` holds one measured entry per texture the
 * game can draw (`dog-husky-sheltered`, or `dog-sheltered` for the
 * species-level fallback), made by `tools/measure-wardrobe-anchors.py`. The
 * sprites are not consistent within a species — each variant's pose is drawn
 * on its own — so the key is the sprite, not the species. The table below is
 * only what is used when that file has not loaded or has no entry.
 */
export interface WardrobeAnchor {
  dx: number;
  dy: number;
  widthFrac: number;
  heightFrac: number;
  rotation: number;
  flip?: boolean;
  maskDx?: number;
  maskDy?: number;
  maskRadiusFrac?: number;
}

/**
 * Species-level defaults: the median of each species' measured `sheltered`
 * anchors, for when `wardrobe-anchors.json` has not loaded or has no entry for
 * the sprite. Coats sit on the body, scarves on the neck, hats on the head;
 * none has the head mask, which is per sprite.
 */
const DEFAULT_WARDROBE_ANCHORS: Record<Species, WardrobeAnchor> = {
  dog:     { dx: 0.018, dy: 0.138, widthFrac: 0.370, heightFrac: 0.280, rotation: 0 },
  fox:     { dx: 0.029, dy: 0.117, widthFrac: 0.278, heightFrac: 0.210, rotation: 0 },
  cat:     { dx: -0.002, dy: 0.063, widthFrac: 0.304, heightFrac: 0.223, rotation: -8 },
  bunny:   { dx: 0.003, dy: 0.139, widthFrac: 0.487, heightFrac: 0.357, rotation: 8 },
  bat:     { dx: 0.007, dy: 0.111, widthFrac: 0.500, heightFrac: 0.368, rotation: 30 },
  parrot:  { dx: 0.055, dy: -0.384, widthFrac: 0.273, heightFrac: 0.175, rotation: 0 },
  snake:   { dx: -0.076, dy: -0.312, widthFrac: 0.314, heightFrac: 0.180, rotation: 0 },
  // no garment art yet (SPECIES_AWAITING_GARMENT_ART): a guess, for when it lands
  hedgehog: { dx: 0.000, dy: 0.050, widthFrac: 0.300, heightFrac: 0.220, rotation: 0 },
};

/**
 * Look up the wardrobe anchor for a species, a variant and a pose.
 *
 * `overrides` is the parsed wardrobe-anchors.json. The most specific entry
 * wins: `species-variant-pose` (the sprite itself), `species-pose` (the
 * species-level sprite), `species-variant`, `species`; then the built-in
 * default.
 *
 * Pass the variant and the pose of the **texture that is drawn**, not of the
 * animal: while a variant's art is still arriving the game draws the
 * species-level sprite, whose pose is a different drawing, and its anchor is
 * `species-pose`. `variant` is then undefined.
 */
export function getWardrobeAnchor(
  species: Species,
  variant?: string,
  overrides?: Record<string, WardrobeAnchor>,
  pose?: string,
): WardrobeAnchor {
  if (overrides) {
    if (variant && pose && overrides[`${species}-${variant}-${pose}`]) {
      return overrides[`${species}-${variant}-${pose}`];
    }
    if (pose && overrides[`${species}-${pose}`]) return overrides[`${species}-${pose}`];
    if (variant && overrides[`${species}-${variant}`]) return overrides[`${species}-${variant}`];
    if (overrides[species]) return overrides[species];
  }
  return DEFAULT_WARDROBE_ANCHORS[species];
}

// ── Equip / unequip ──────────────────────────────────────────

/**
 * Put a garment on an animal. Garment code must match the species'
 * allowed garment (can't put a coat on a snake).
 */
export function equipWardrobe(animal: Animal, garment: Garment, hex?: string): Animal {
  if (SPECIES_GARMENT[animal.species] !== garment) {
    // Silent no-op — caller should ensure species-garment match first
    // via getGarmentForSpecies(). We don't throw because game UI
    // should never present an invalid choice.
    return animal;
  }
  return { ...animal, wardrobe: formatWardrobe(garment, hex) };
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
 * Does this animal have to put something on to go out in this weather?
 * `needsCoat` is the weather's half of the answer; the other half is
 * whether there is a garment drawn for her to put on at all — see
 * `SPECIES_AWAITING_GARMENT_ART`. Everything that gates on or offers a
 * garment asks this and not `needsCoat`.
 */
export function animalNeedsGarment(animal: Animal, weather: Weather): boolean {
  return canBeDressed(animal.species) && needsCoat(animal, weather);
}

/**
 * Is the animal properly dressed for the given weather? True if
 * the weather doesn't require a coat, OR the animal has one equipped.
 * Used by the let-outside gate in garden.ts.
 */
export function isDressedForWeather(
  animal: Animal,
  weather: Weather,
): boolean {
  if (!animalNeedsGarment(animal, weather)) return true;
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
  if (!animalNeedsGarment(animal, weather)) return null;
  if (animal.wardrobe) return null;
  const garment = getGarmentForSpecies(animal.species);
  if (isCold(weather)) {
    return `Too cold — ${animal.name} needs a ${garment} before going out.`;
  }
  return `${animal.name} needs a ${garment} in this weather.`;
}
