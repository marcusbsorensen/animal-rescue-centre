import type { Species } from '@arc/shared-types';

/**
 * How big each animal is drawn, relative to every other animal beside her.
 *
 * **The art cannot carry this, and that is the whole reason the table is
 * here.** Every animal sprite fills its own square canvas: measured across
 * all 600 files, the opaque part runs 0.62 to 1.00 of the file on its long
 * side, mean 0.849, and *no state carries any species scale at all* — the
 * widest any pose separates its largest species from its smallest is 1.22x,
 * where a dog beside a bat should be 3.3x. The install step is why:
 * `tools/install-restyled.py` crops each sprite to its subject and rebuilds
 * a square canvas `MARGIN = 1.06` times the subject's long edge, so
 * everything lands at 0.9434 of its file whatever the artist drew. Asking a
 * generator for relative size buys something the pipeline then deletes.
 *
 * So the size is set here, in code, and applied by `createAnimalSprite`
 * against the subject's measured bounds rather than against the canvas —
 * which also takes the 0.62-to-1.00 spread out, because the sprite layer
 * knows where the animal is inside her file.
 *
 * 1.0 is the dog, the largest animal in the game. The bat is a tenth of his
 * length in life and three tenths of his height here, because a bat drawn at
 * a tenth of a dog would be four pixels. The ladder is honest about the order
 * and the rough spacing rather than to the centimetre, which is what a child
 * reads off it.
 *
 * **The rule that places a new animal without anyone measuring art:**
 *
 *   unit = (body length in metres / 0.90) ** 0.70, rounded to 0.02
 *
 * The exponent is fitted to the eight shipped rungs; residuals are at most
 * 0.12 (cat) and 0.045 on average. Where the rule and a shipped number
 * disagree, the shipped number wins — it is what the game has drawn and what
 * players have seen.
 */

/**
 * The share of a drawing box the largest animal's long side takes up.
 *
 * Not 1.0, so Rule 3's 10% clear above the head survives into every box a
 * caller hands us, with `ANIMAL_FOOT_BAND` of slack below. It also means a
 * dog is drawn at very nearly the size he is drawn at today — the canvas
 * contain-fit put his subject at about 0.85 of the box — so the visible
 * change on a mixed row is the small animals coming down to their own size,
 * not the big ones growing.
 */
export const ANIMAL_CANVAS_CAP = 0.8;

/**
 * The transparent band left under the feet, as a share of the box.
 *
 * A row of animals bottom-aligned to one line, each with the same band
 * beneath her, stands on that line at any size. This is Rule 8's "real
 * ground" and "true relative scale, never thumbnailed into equal cells".
 */
export const ANIMAL_FOOT_BAND = 0.04;

/**
 * Every species that has sprite art, which is not the same set as `Species`.
 *
 * **Raccoon and skunk have ten sprites each and are deliberately not members
 * of `Species`.** They are the tunnel minigame's habitat animals — see
 * `Animal` in `./tunnel`, `'fox' | 'skunk' | 'hedgehog' | 'raccoon'` — and
 * no animal in the shelter is ever one of them: nothing spawns a raccoon,
 * nothing adopts a skunk. Admitting them to `Species` would be a feature,
 * not a scale fix, and the compiler says so loudly: more than twenty
 * `Record<Species, ...>` maps would each need a new row, among them arrival
 * stories, names, variants, colours, temperament, rain and cold tolerance,
 * crate compatibility, crate preference, alarm rank, grooming tools, toys,
 * garments and wardrobe anchors, plus `SPECIES_SIZE` in
 * `apps/game/src/driving/crate-loading-view.ts`. `unlockedSpecies` in the
 * save file would also start carrying a value older saves have never seen.
 * (`docs/plan-lily-content-2026-07-04.md` already records this as six hard
 * breaks; it is more than six now.)
 *
 * So they are carried here, where the question is only "how big is this
 * drawing", and nowhere else.
 */
export type ScaledSpecies = Species | 'raccoon' | 'skunk';

/** Every species with art, largest first. */
export const SCALED_SPECIES: readonly ScaledSpecies[] = [
  'dog', 'fox', 'cat', 'raccoon', 'skunk', 'bunny', 'snake', 'parrot', 'hedgehog', 'bat',
];

/**
 * The ladder, in units of a dog.
 *
 * The eight shipped rungs are the ones `SPECIES_SIZE` has always used;
 * `packages/game-logic/src/__tests__/animal-scale.test.ts` asserts they still
 * agree, so the duplicate cannot drift while it exists.
 */
export const SPECIES_UNIT: Record<ScaledSpecies, number> = {
  dog: 1,          // 0.90 m
  fox: 0.88,       // 0.67 m
  cat: 0.74,       // 0.46 m
  raccoon: 0.7,    // 0.55 m — from the rule; no shipped value
  skunk: 0.66,     // 0.50 m — from the rule; no shipped value
  bunny: 0.58,     // 0.40 m
  snake: 0.56,     // 0.32 m coiled
  parrot: 0.5,     // 0.33 m
  hedgehog: 0.38,  // 0.23 m
  bat: 0.3,        // 0.22 m span
};

/**
 * Variants whose real animal is far enough from its species' default that
 * one number for the species reads as wrong.
 *
 * The art has 60 species-variants and the ladder above has 10 rungs, so
 * without this a macaw and a budgie are the same bird and a pug is the same
 * dog as a collie. Keyed `species-variant`; anything not named here inherits
 * its species, which is the point of keeping the list short.
 *
 * `bat-fruit` is the exception to the exception. The bat's own rung is
 * already a deliberate fudge — 0.30 for an animal a twelfth of a dog — so
 * extending the rule to a flying fox would be false precision. 0.45 is a
 * judgement: the big bat reads as bigger than the pipistrelle without
 * becoming a cat.
 */
export const VARIANT_UNIT: Record<string, number> = {
  'dog-pug': 0.5,          // 0.33 m head and body
  'dog-terrier': 0.62,     // 0.45 m
  'fox-fennec': 0.52,      // 0.35 m, against the red fox's 0.67
  'bunny-lionhead': 0.44,  // 0.28 m, a dwarf breed
  'parrot-macaw': 0.96,     // 0.85 m including the tail — a scarlet macaw really is
  'parrot-budgie': 0.32,   // 0.18 m
  'parrot-lovebird': 0.29, // 0.15 m — the one figure off the rule's 0.02 grid
  'bat-fruit': 0.45,       // judgement, not derivation — see above
};

/** True when this species has a rung on the ladder. */
export function isScaledSpecies(species: string): species is ScaledSpecies {
  return Object.prototype.hasOwnProperty.call(SPECIES_UNIT, species);
}

/**
 * How big this animal is, in units of a dog — the variant's own figure where
 * it has one, otherwise her species'.
 *
 * Returns `undefined` for a species with no rung, so a caller can decide
 * loudly rather than silently drawing it dog-sized. That is the failure this
 * whole file exists to stop.
 */
export function animalScaleUnit(species: string, variant?: string | null): number | undefined {
  if (variant) {
    const exact = VARIANT_UNIT[`${species}-${variant}`];
    if (exact !== undefined) return exact;
  }
  return isScaledSpecies(species) ? SPECIES_UNIT[species] : undefined;
}

/**
 * The share of a drawing box this animal's long side should take up.
 *
 * `animalScaleUnit` x `ANIMAL_CANVAS_CAP`: a dog at 0.80 of his box, a
 * hedgehog at 0.304, a budgie at 0.205. This is the number the sprite layer
 * draws to and the number `tools/check-sprite-scale.py` measures against.
 */
export function animalScaleFraction(species: string, variant?: string | null): number | undefined {
  const unit = animalScaleUnit(species, variant);
  return unit === undefined ? undefined : unit * ANIMAL_CANVAS_CAP;
}
