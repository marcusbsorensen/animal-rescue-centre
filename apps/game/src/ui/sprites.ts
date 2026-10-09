import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_COLOURS, animalScaleFraction } from '@arc/game-logic';
import { FONTS } from './constants';
import { animalSpriteBounds } from './animal-sprite-bounds';

/**
 * Live view of GameScene's `store.sickAnimals`, registered once at scene
 * setup. We hold the Map itself rather than a copy, so every add/delete
 * the illness and vet flows make is visible here immediately — there is
 * no sync step to forget.
 *
 * `health` is not a usable stand-in: animals spawn at 70–99, so any
 * threshold below 100 would paint healthy new arrivals as sick.
 */
let sickAnimalIds: ReadonlyMap<string, unknown> | null = null;

/** Point the sprite layer at the store's sickAnimals map. Call once. */
export function registerSickAnimals(map: ReadonlyMap<string, unknown>): void {
  sickAnimalIds = map;
}

/** True when the illness flow currently has this animal marked sick. */
function isSick(animal: Animal): boolean {
  return sickAnimalIds?.has(animal.id) ?? false;
}

/**
 * Derive a visual sprite state from the animal's needs and game state.
 * Available sprite states: arriving, sick, eating, sleeping, sheltered
 */
function deriveVisualState(animal: Animal): string {
  // If arriving, always show arriving sprite
  if (animal.state === 'arriving') return 'arriving';
  // Being unwell outranks the need states — it's the one thing the
  // player has to act on at the vet, so it should read at a glance.
  if (isSick(animal)) return 'sick';
  // Very tired → sleeping sprite
  if (animal.tiredness >= 70) return 'sleeping';
  // Very hungry → eating sprite (they need food!)
  if (animal.hunger >= 70) return 'eating';
  // Default: sheltered (happy/active)
  return 'sheltered';
}

/**
 * Get the texture key for an animal based on species, variant, and state.
 * Resolution order:
 *   1. species-variant-spriteState  (e.g. cat-ginger-sheltered)
 *   2. species-variant-sheltered    (variant fallback state)
 *   3. species-spriteState          (generic species, exact state)
 *   4. species-sheltered            (generic species fallback)
 *   5. any species-* texture        (last resort before rectangle)
 *   6. null → coloured rectangle
 */
function getAnimalTextureKey(scene: Phaser.Scene, species: Species, state: string, variant?: string): string | null {
  // Map game states to sprite states
  const spriteState = state === 'pet' ? 'sheltered'
    : state === 'bonding' ? 'sheltered'
    : state;

  // Try variant-specific textures first
  if (variant) {
    const variantExact = `${species}-${variant}-${spriteState}`;
    if (scene.textures.exists(variantExact)) return variantExact;

    const variantFallback = `${species}-${variant}-sheltered`;
    if (scene.textures.exists(variantFallback)) return variantFallback;

    // Any state for this variant
    const states = ['sheltered', 'arriving', 'eating', 'sleeping'];
    for (const s of states) {
      const key = `${species}-${variant}-${s}`;
      if (scene.textures.exists(key)) return key;
    }
  }

  // Generic species textures (no variant)
  const exact = `${species}-${spriteState}`;
  if (scene.textures.exists(exact)) return exact;

  const fallback = `${species}-sheltered`;
  if (scene.textures.exists(fallback)) return fallback;

  const states = ['sheltered', 'arriving', 'eating', 'sleeping'];
  for (const s of states) {
    const key = `${species}-${s}`;
    if (scene.textures.exists(key)) return key;
  }

  return null;
}

/**
 * How big to draw this animal relative to the box she is handed.
 *
 * **`'species'` is the comparative claim and it is never the default.** A
 * screen that asks for it is saying "the animals on me are drawn beside each
 * other, so their sizes mean something"; a screen that asks for `'fill'` is
 * saying "there is one animal here and nothing to compare her with". The
 * decision is recorded at the call site rather than inferred from a default,
 * because the default is what hid the bug for this long: `SPECIES_SIZE` was
 * used in exactly one place and every other screen contain-fitted the whole
 * texture, so a hedgehog has been drawn dog-sized beside a fox on six
 * screens. `apps/game/src/ui/__tests__/animal-scale-call-sites.test.ts`
 * fails if a call site leaves the question open.
 *
 * - `'species'` — the animal's long side is `animalScaleFraction` of the
 *   box's shorter side: a dog at 0.80 of it, a hedgehog at 0.304, a budgie
 *   at 0.205. Measured from the animal rather than from her file, so the
 *   0.62-to-1.00 spread in how much of its canvas each sprite fills comes
 *   out and `displayWidth` comes back meaning the animal. Use wherever two
 *   animals are visible at once — a row, a bay, a corridor, a queue, a panel
 *   pairing, a grid of passers-by.
 * - `'fill'` — the whole file is contain-fitted into the box, which is what
 *   every call site has always done. Use for one animal alone, where there
 *   is nothing to be relatively sized against. It fills her frame because
 *   the install step already normalises every sprite to fill its own canvas,
 *   so no arithmetic is needed to make a lone hedgehog look like a hedgehog
 *   rather than a mistake — and the hand-measured decorations on those
 *   screens (the vet's label beside her, the toy row under her, the grooming
 *   dirt spread across her) stay exactly where they were measured.
 *
 * Omitting the option is `'fill'`. It is still an omission rather than a
 * choice, and the call-site test treats it as one.
 */
export type AnimalDrawScale = 'species' | 'fill';

/**
 * The Phaser frame cut to the animal herself, rather than to her file.
 *
 * The name is fixed and the frame is added to the texture once, the first
 * time any sprite needs it, so this costs one small object per texture and
 * nothing per sprite.
 */
const SUBJECT_FRAME = '__arc-subject';

/**
 * The frame name to draw, or `undefined` to draw the whole canvas.
 *
 * Returns `undefined` — and so falls back to the old whole-canvas fit —
 * when the texture is not a measured animal sprite, when the committed
 * bounds disagree with the file's actual size (a stale table, which
 * `check-sprite-scale.py --check-bounds` is the gate against), or when the
 * scene's texture manager is a stand-in that cannot carry frames, as it is
 * in the unit tests.
 */
function subjectFrame(scene: Phaser.Scene, textureKey: string): string | undefined {
  const bounds = animalSpriteBounds(textureKey);
  if (!bounds) return undefined;
  const manager = scene.textures;
  if (!manager || typeof manager.get !== 'function') return undefined;
  const texture = manager.get(textureKey);
  if (!texture || typeof texture.add !== 'function' || typeof texture.has !== 'function') {
    return undefined;
  }
  if (texture.has(SUBJECT_FRAME)) return SUBJECT_FRAME;
  const source = texture.source?.[0];
  if (!source || source.width !== bounds.canvasW || source.height !== bounds.canvasH) {
    return undefined;
  }
  return texture.add(SUBJECT_FRAME, 0, bounds.x, bounds.y, bounds.w, bounds.h)
    ? SUBJECT_FRAME
    : undefined;
}

/**
 * Create an animal sprite — uses real art if available, coloured rectangle as fallback.
 *
 * **The contract: `width`/`height` are the box the animal is drawn inside.**
 * `displayWidth <= width` and `displayHeight <= height` hold for both the
 * image and the rectangle fallback, so a caller can lay decorations out
 * against the box it asked for and be right.
 *
 * It did not used to. The fit scale was multiplied by two, so an image
 * rendered at twice the box while the fallback rectangle rendered at
 * exactly the box — and every caller that placed a label off the size it
 * passed put that label inside the animal. RoomView's name pill sat 16px
 * inside the animal's feet, its three status chips across the chest.
 * Nineteen call sites passed a box half the size they wanted, and each one
 * had to know that. (`ui/__tests__/sprites.test.ts` holds the contract.)
 *
 * Returns the created game object.
 */
export function createAnimalSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  animal: Animal,
  options?: {
    width?: number;
    height?: number;
    interactive?: boolean;
    stateOverride?: string;
    /** See {@link AnimalDrawScale}. Say which; the default is the old behaviour. */
    scale?: AnimalDrawScale;
  }
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  const w = options?.width ?? 80;
  const h = options?.height ?? 64;

  const visualState = options?.stateOverride ?? deriveVisualState(animal);
  const textureKey = getAnimalTextureKey(scene, animal.species, visualState, animal.variant);

  if (textureKey) {
    // A comparative sprite is drawn from the frame cut to the animal, so her
    // size is set outright and `displayWidth` comes back meaning the animal
    // rather than her transparent margin. How much of its file a sprite
    // fills runs 0.62 to 1.00 across the set and wanders pose to pose within
    // one animal, so fitting the canvas would leave her changing size when
    // she changes mood — in a row, beside an animal that did not.
    //
    // A `'fill'` sprite keeps the whole canvas, because its screen measures
    // decorations off the box and off `displayWidth`, and those numbers were
    // read from the canvas.
    const frame = options?.scale === 'species'
      ? subjectFrame(scene, textureKey)
      : undefined;
    const img = frame
      ? scene.add.image(x, y, textureKey, frame)
      : scene.add.image(x, y, textureKey);
    // Contain, not cover: the smaller ratio, so the whole animal is inside
    // the box on both axes. The art is square (480 of 523 files are 512²),
    // so a square box draws the animal at exactly that box and a wider one
    // leaves slack at the sides — which is why a caller reading back
    // `displayWidth` gets a different answer from the width it passed.
    const contain = Math.min(w / img.width, h / img.height);
    let scale = contain;

    if (options?.scale === 'species') {
      const fraction = animalScaleFraction(animal.species, animal.variant);
      // No rung on the ladder means a species with art and no size, which is
      // how raccoon and skunk were drawn dog-sized. Leave it at the plain
      // fit rather than guessing; `check-sprite-scale.py` names it by sprite.
      if (fraction !== undefined) {
        scale = frame
          // `img` is the animal, so her long side is set to her share of the
          // box outright, and the box's own aspect ratio cannot change it.
          ? (fraction * Math.min(w, h)) / Math.max(img.width, img.height)
          // No measured bounds: the canvas stands in for the animal. True to
          // within how much of its file that sprite happens to fill.
          : contain * fraction;
      }
    }
    img.setScale(scale);

    if (options?.interactive) {
      img.setInteractive({ useHandCursor: true });
    }
    return img;
  }

  // Fallback: coloured rectangle
  const rect = scene.add.rectangle(x, y, w, h, SPECIES_COLOURS[animal.species])
    .setStrokeStyle(1, 0x000000, 0.3);

  if (options?.interactive) {
    rect.setInteractive({ useHandCursor: true });
  }
  return rect;
}

/**
 * Create a food icon sprite — uses real art if available, emoji text as fallback.
 */
export function createFoodSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  foodType: string,
  fallbackEmoji: string,
  size = 56
): Phaser.GameObjects.Image | Phaser.GameObjects.Text {
  const key = `food-${foodType}`;
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key);
    const scale = size / Math.max(img.width, img.height);
    img.setScale(scale);
    return img;
  }

  return scene.add.text(x, y, fallbackEmoji, {
    fontSize: `${size}px`, fontFamily: FONTS.body
  }).setOrigin(0.5);
}
