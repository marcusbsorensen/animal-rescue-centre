import Phaser from 'phaser';

/**
 * ShakeOffAnimation — the "wet dog shakes off water" comedy.
 *
 * Animation sequence (~1.2s total):
 *   1. Sprite wiggles rapidly horizontally (±8px every 40ms).
 *   2. Water droplets erupt radially from the sprite centre.
 *   3. A few "splat" marks land briefly on the screen edges (so it
 *      looks like the player got wet too — Marcus-confirmed gag).
 *   4. Sprite settles back to its original position.
 *
 * Call with a callback that fires at the peak of the shake — that's
 * when the caller should apply happiness deltas to nearby animals
 * via game-logic's applyShakeOff().
 */

// Droplet texture key — generated procedurally once per scene
const DROPLET_TEX = 'shake-droplet';

function ensureDroplet(scene: Phaser.Scene): void {
  if (scene.textures.exists(DROPLET_TEX)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Classic cartoon droplet — teardrop shape
  g.fillStyle(0x4a8fbf, 1);
  g.fillCircle(6, 8, 4);
  g.fillStyle(0x4a8fbf, 1);
  g.fillTriangle(6, 0, 3, 6, 9, 6);
  // Highlight for shape
  g.fillStyle(0x9ad0e8, 0.7);
  g.fillCircle(5, 7, 1.5);
  g.generateTexture(DROPLET_TEX, 12, 14);
  g.destroy();
}

export interface ShakeOffOpts {
  /** Called at the moment the droplets explode (peak of shake). */
  onPeak?: () => void;
  /** Called when the whole sequence is done. */
  onComplete?: () => void;
}

/**
 * Trigger the shake-off animation on a sprite. Returns immediately —
 * the animation runs async via tweens. Safe to call multiple times;
 * each call is independent.
 */
export function playShakeOff(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.GameObject & { x: number; y: number },
  opts: ShakeOffOpts = {},
): void {
  ensureDroplet(scene);
  const { width, height } = scene.scale;

  const originalX = sprite.x;
  const originalY = sprite.y;

  // 1. Wiggle the sprite (5 rapid lateral shakes)
  const wiggleTween = scene.tweens.add({
    targets: sprite,
    x: { from: originalX - 8, to: originalX + 8 },
    duration: 40,
    yoyo: true,
    repeat: 8,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      (sprite as Phaser.GameObjects.GameObject & { x: number; y: number }).x = originalX;
      (sprite as Phaser.GameObjects.GameObject & { x: number; y: number }).y = originalY;
    },
  });

  // 2. Schedule droplet burst at peak (~200ms in, mid-wiggle)
  scene.time.delayedCall(200, () => {
    opts.onPeak?.();

    // Radial droplet burst — 14 droplets in all directions
    const emitter = scene.add.particles(sprite.x, sprite.y, DROPLET_TEX, {
      speed: { min: 180, max: 320 },
      angle: { min: 0, max: 360 },
      lifespan: 900,
      scale: { start: 1, end: 0.5 },
      alpha: { start: 1, end: 0.2 },
      gravityY: 450,
      rotate: { min: 0, max: 360 },
      quantity: 14,
      emitting: false,  // burst-only
    });
    emitter.setDepth(950);
    emitter.explode(14);
    // Clean up after particles die
    scene.time.delayedCall(1100, () => emitter.destroy());

    // 3. "Splats on the screen" gag — 3 small droplets land briefly
    //    on random spots near the top of the viewport to look like the
    //    screen itself got wet. Fades after ~800ms.
    for (let i = 0; i < 3; i++) {
      const sx = Phaser.Math.Between(40, width - 40);
      const sy = Phaser.Math.Between(20, Math.min(200, height - 200));
      const splat = scene.add.image(sx, sy, DROPLET_TEX).setScale(1.8).setDepth(960);
      scene.tweens.add({
        targets: splat,
        alpha: 0,
        duration: 800,
        delay: 200 + i * 80,
        onComplete: () => splat.destroy(),
      });
    }
  });

  // 4. Fire completion callback at end of wiggle
  wiggleTween.once('complete', () => opts.onComplete?.());
}
