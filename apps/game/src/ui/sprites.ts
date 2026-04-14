import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_COLOURS } from '@arc/game-logic';

/**
 * Derive a visual sprite state from the animal's needs and game state.
 * Available sprite states: arriving, eating, sleeping, sheltered
 */
function deriveVisualState(animal: Animal): string {
  // If arriving, always show arriving sprite
  if (animal.state === 'arriving') return 'arriving';
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
 * Create an animal sprite — uses real art if available, coloured rectangle as fallback.
 * Returns the created game object.
 */
export function createAnimalSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  animal: Animal,
  options?: { width?: number; height?: number; interactive?: boolean; stateOverride?: string }
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  const w = options?.width ?? 80;
  const h = options?.height ?? 64;

  const visualState = options?.stateOverride ?? deriveVisualState(animal);
  const textureKey = getAnimalTextureKey(scene, animal.species, visualState, animal.variant);

  if (textureKey) {
    const img = scene.add.image(x, y, textureKey);
    // Scale to fit the target size
    const scale = Math.min(w / img.width, h / img.height) * 2; // 2x because sprites are 128px
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
    fontSize: `${size}px`,
  }).setOrigin(0.5);
}
