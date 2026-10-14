import Phaser from 'phaser';

/**
 * The pale mist the dialogue lays over the world.
 *
 * The reference game drifts a soft white mist over the scene behind a
 * conversation: the map is still there, but quieter, and the speaker and the
 * box read cleanly against it. A flat dark dim reads as "the game is switched
 * off"; a mist reads as "the world is listening".
 *
 * It is drawn once into a small canvas texture (no art file) from a seeded
 * random walk, so every conversation gets the same weather. Thickest at the top
 * of the screen, thinning towards the box.
 */
export const MIST_KEY = 'dialogue-mist';

const W = 768;
const H = 432;

/** A tiny seeded generator so the mist is the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Make the mist texture if it is not there yet. Returns its key. */
export function ensureMistTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(MIST_KEY)) return MIST_KEY;
  const tex = scene.textures.createCanvas(MIST_KEY, W, H);
  if (!tex) return MIST_KEY;
  const ctx = tex.getContext();

  // An even veil, so nothing behind is at full strength.
  ctx.fillStyle = 'rgba(238, 246, 249, 0.30)';
  ctx.fillRect(0, 0, W, H);

  // Heavier at the top, clearing towards the box.
  const fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(248, 252, 253, 0.50)');
  fade.addColorStop(0.55, 'rgba(248, 252, 253, 0.14)');
  fade.addColorStop(1, 'rgba(248, 252, 253, 0.04)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  // Soft puffs, most of them in the upper two thirds.
  const rand = seeded(0x5eed);
  for (let n = 0; n < 90; n++) {
    const x = rand() * W;
    const y = Math.pow(rand(), 1.7) * H * 0.9;
    const r = 30 + rand() * 120;
    const a = 0.1 + rand() * 0.16;
    const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, `rgba(250, 253, 254, ${a.toFixed(3)})`);
    puff.addColorStop(1, 'rgba(250, 253, 254, 0)');
    ctx.fillStyle = puff;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  tex.refresh();
  return MIST_KEY;
}
