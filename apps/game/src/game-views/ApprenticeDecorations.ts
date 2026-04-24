import Phaser from 'phaser';
import type { GameStateStore } from '../game-state';

/**
 * ApprenticeDecorations — decorative painted chibi sprites of recruited
 * apprentices placed around the rescue centre to show them "helping".
 *
 * The sprites are static PNGs served from
 *   /admin/mockup-assets/cast/apprentices/<pose>.png
 * and are preloaded by BootScene under texture keys of the form
 *   apprentice-<pose>        (e.g. apprentice-rhubarb-feeding)
 *
 * This module is pure decoration — no interactivity, no logic impact.
 * Only recruited apprentices render; the no-recruit case emits nothing.
 *
 * Placement logic is deliberately hand-tuned per view/species rather
 * than driven by anchors — these are sparse cameo sprites, not the
 * primary animal cast, and painting them by rule keeps the view code
 * self-contained without blowing up the anchor-editor surface area.
 */

export type ApprenticeRoomSpecies =
  | 'cat' | 'dog' | 'bunny' | 'fox' | 'bat' | 'parrot' | 'snake';

export interface ApprenticeDecorationOptions {
  viewMode: 'corridor' | 'room' | 'garden';
  roomSpecies?: ApprenticeRoomSpecies;
  width: number;
  height: number;
}

/** Apprentice IDs as used by the game-logic store. */
type ApprenticeId = 'rhubarb' | 'amara' | 'kofi';

/** Internal placement descriptor for a single decoration instance. */
interface Placement {
  key: string;              // texture key, e.g. 'apprentice-rhubarb-feeding'
  x: number;                // pixel x (sprite centre)
  y: number;                // pixel y (sprite centre)
  displayHeight: number;    // target on-screen height in px; width auto-ratio
  swayDeg?: number;         // peak rotation in degrees for sway tween
  swayDurMs?: number;       // period of the sway tween
  pageFlip?: boolean;       // subtle scale pulse for Kofi-reading
  flipX?: boolean;          // mirror sprite horizontally
  depth?: number;           // per-sprite depth override
}

const DEFAULT_DEPTH = 50;

function isRecruited(store: GameStateStore, id: ApprenticeId): boolean {
  return (store.apprentices ?? []).some((a) => a.id === id);
}

function textureReady(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}

/**
 * Instantiate one placement into a sprite on the given container.
 * Safely no-ops if the texture isn't loaded yet (e.g. 404 during dev).
 */
function placeOne(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  p: Placement,
): Phaser.GameObjects.Image | null {
  if (!textureReady(scene, p.key)) return null;

  const tex = scene.textures.get(p.key).getSourceImage() as HTMLImageElement;
  const ratio = tex && tex.height ? tex.width / tex.height : 0.7;
  const h = p.displayHeight;
  const w = h * ratio;

  const img = scene.add.image(p.x, p.y, p.key)
    .setDisplaySize(w, h)
    .setOrigin(0.5, 0.5)
    .setAlpha(0.95)
    .setDepth(p.depth ?? DEFAULT_DEPTH);

  if (p.flipX) img.setFlipX(true);

  container.add(img);

  // Gentle sway — harmless decorative motion.
  if (p.swayDeg && p.swayDeg > 0) {
    const dur = p.swayDurMs ?? 3000;
    img.setAngle(-p.swayDeg);
    scene.tweens.add({
      targets: img,
      angle: p.swayDeg,
      duration: dur,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Page-flip: subtle scale pulse for Kofi reading aloud.
  if (p.pageFlip) {
    const baseScaleX = img.scaleX;
    const baseScaleY = img.scaleY;
    scene.tweens.add({
      targets: img,
      scaleX: baseScaleX * 1.03,
      scaleY: baseScaleY * 0.98,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return img;
}

// ── Placement rule-sets ─────────────────────────────────────────

function corridorPlacements(
  store: GameStateStore,
  width: number,
  height: number,
): Placement[] {
  const out: Placement[] = [];

  // Rhubarb — bottom-right, skateboarding pose (falls back to feeding).
  if (isRecruited(store, 'rhubarb')) {
    const poseKey = 'apprentice-rhubarb-skateboarding-garden';
    const fallback = 'apprentice-rhubarb-feeding';
    out.push({
      key: poseKey, // textureReady check in placeOne handles fallback via list below
      x: width * 0.88,
      y: height * 0.82,
      displayHeight: 100,
      flipX: true, // face back toward the corridor
    });
    // Fallback entry (only renders if skateboarding isn't loaded).
    out.push({
      key: fallback,
      x: width * 0.88,
      y: height * 0.82,
      displayHeight: 100,
      // Lower depth so if both happened to exist, the primary wins visually.
      depth: DEFAULT_DEPTH - 1,
    });
  }

  // Amara — climbing up a shelving fixture on the left side.
  if (isRecruited(store, 'amara')) {
    out.push({
      key: 'apprentice-amara-climbing',
      x: width * 0.08,
      y: height * 0.55,
      displayHeight: 120,
    });
  }

  // Kofi — seated reading near the entrance (bottom-left-ish).
  if (isRecruited(store, 'kofi')) {
    out.push({
      key: 'apprentice-kofi-reading-aloud',
      x: width * 0.22,
      y: height * 0.82,
      displayHeight: 100,
      pageFlip: true,
    });
  }

  return out;
}

function roomPlacements(
  store: GameStateStore,
  species: ApprenticeRoomSpecies,
  width: number,
  height: number,
): Placement[] {
  const out: Placement[] = [];

  if (species === 'cat') {
    if (isRecruited(store, 'amara')) {
      // Near the bookshelf area — upper-left of the room.
      out.push({
        key: 'apprentice-amara-cat-shoulder',
        x: width * 0.18,
        y: height * 0.42,
        displayHeight: 130,
        swayDeg: 1,
        swayDurMs: 3200,
      });
    }
    if (isRecruited(store, 'rhubarb')) {
      // Seated on the floor, cat in lap.
      out.push({
        key: 'apprentice-rhubarb-cat-lap',
        x: width * 0.72,
        y: height * 0.78,
        displayHeight: 120,
        swayDeg: 1,
        swayDurMs: 3000,
      });
    }
  }

  if ((species === 'parrot' || species === 'snake') && isRecruited(store, 'kofi')) {
    const key = species === 'parrot'
      ? 'apprentice-kofi-parrot-arm'
      : 'apprentice-kofi-snake-nose';
    out.push({
      key,
      x: width * 0.28,
      y: height * 0.72,
      displayHeight: 140,
    });
  }

  if (species === 'dog' && isRecruited(store, 'rhubarb')) {
    out.push({
      key: 'apprentice-rhubarb-feeding',
      x: width * 0.25,
      y: height * 0.76,
      displayHeight: 120,
    });
  }

  return out;
}

function gardenPlacements(
  store: GameStateStore,
  width: number,
  height: number,
): Placement[] {
  const out: Placement[] = [];

  if (isRecruited(store, 'rhubarb')) {
    // In the lawn area — middle-right, scaled to feel like a kid
    // skateboarding on the path.
    out.push({
      key: 'apprentice-rhubarb-skateboarding-garden',
      x: width * 0.72,
      y: height * 0.72,
      displayHeight: 130,
    });
  }

  // Amara + Kofi poses aren't outdoor-themed, so we deliberately skip them.
  return out;
}

/**
 * Main entry. Safe to call from any view's render pass. If no
 * apprentices are recruited, or no textures are loaded, this is a
 * no-op — nothing is added to the container.
 */
export function renderApprenticeDecorations(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  store: GameStateStore,
  opts: ApprenticeDecorationOptions,
): void {
  if (!store.apprentices || store.apprentices.length === 0) return;

  const { viewMode, roomSpecies, width, height } = opts;

  let placements: Placement[] = [];
  if (viewMode === 'corridor') {
    placements = corridorPlacements(store, width, height);
  } else if (viewMode === 'room' && roomSpecies) {
    placements = roomPlacements(store, roomSpecies, width, height);
  } else if (viewMode === 'garden') {
    placements = gardenPlacements(store, width, height);
  }

  for (const p of placements) {
    placeOne(scene, container, p);
  }
}
