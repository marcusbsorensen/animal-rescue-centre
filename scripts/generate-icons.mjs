#!/usr/bin/env node
/**
 * Generate every icon the game needs.
 *
 * Before this existed, public/icons/icon-192.png and icon-512.png were
 * 11-byte files containing the ASCII string "placeholder", so the PWA
 * manifest had been pointing at dead icons since April.
 *
 * TWO SOURCES, and they are not interchangeable.
 *
 * The APP ICONS come from `arc-suite-icon.svg`, the Interfulgent suite mark
 * (recorded 2026-10-06). It is vector, so every size is rendered rather than
 * resampled and the old note about the 512px master being upscaled and soft
 * no longer applies. It carries its own dark ground and its own margin, so
 * nothing here composites or insets it — the one exception is the maskable
 * icon, and even that needs no inset because the mark already sits inside the
 * inner 64% where Android's safe zone is the inner 80%.
 *
 * The SPLASH still comes from the painted `arc-logo-icon.png` on cream,
 * because it is the launch screen and has to match the game's own ground.
 * Putting the dark suite mark there would flash near-black before Phaser
 * paints cream. Changing that is a separate decision about the app's ground,
 * not about its icon.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITE = path.join(root, 'apps/game/public/assets/logo/arc-suite-icon.svg');
const SRC = path.join(root, 'apps/game/public/assets/logo/arc-logo-icon.png');
const ICONS = path.join(root, 'apps/game/public/icons');
const XCASSETS = path.join(root, 'apps/game/ios/App/App/Assets.xcassets');

/** Brand cream — matches index.html body, Phaser backgroundColor, manifest. */
const CREAM = { r: 0xfe, g: 0xf9, b: 0xef, alpha: 1 };

/**
 * Compose the mark on an opaque square.
 *
 * `inset` is the fraction of the canvas the mark occupies. Apple icons
 * must be square and fully opaque — a transparent app icon renders black
 * on the home screen — so every output here is flattened.
 */
async function compose(size, inset, out) {
  const box = Math.round(size * inset);
  const mark = await sharp(SRC)
    .resize(box, box, { fit: 'inside', kernel: 'lanczos3' })
    .toBuffer();
  const { width, height } = await sharp(mark).metadata();

  await sharp({
    create: { width: size, height: size, channels: 4, background: CREAM },
  })
    .composite([
      {
        input: mark,
        top: Math.round((size - height) / 2),
        left: Math.round((size - width) / 2),
      },
    ])
    .flatten({ background: CREAM })
    .png({ compressionLevel: 9 })
    .toFile(out);

  return out;
}

/** Rendered straight from the suite SVG — full bleed, no inset, no compositing. */
const vector = [
  // iOS app icon. Single 1024 slot since Xcode 14.
  [1024, path.join(XCASSETS, 'AppIcon.appiconset/AppIcon-512@2x.png')],

  // PWA manifest icons — these were the "placeholder" files.
  [192, path.join(ICONS, 'icon-192.png')],
  [512, path.join(ICONS, 'icon-512.png')],

  // Home-screen icon for the web clip / standalone PWA. Without a
  // <link rel="apple-touch-icon"> pointing at one of these, iOS falls back to
  // a grey letter tile — which is what "Add to Home Screen" produced on the
  // simulator on 2026-08-29. 180px is the size Safari asks for.
  [180, path.join(ICONS, 'apple-touch-icon.png')],

  // Maskable. Android crops to a circle and the safe zone is the inner 80%;
  // the mark's own 18-unit margin already keeps it inside the inner 64%.
  [512, path.join(ICONS, 'icon-512-maskable.png')],
];

/** Composited from the painted mark on cream — the launch screen only. */
const raster = [
  [2732, 0.16, path.join(XCASSETS, 'Splash.imageset/splash-2732x2732.png')],
  [2732, 0.16, path.join(XCASSETS, 'Splash.imageset/splash-2732x2732-1.png')],
  [2732, 0.16, path.join(XCASSETS, 'Splash.imageset/splash-2732x2732-2.png')],
];

console.log(`app icons: ${path.relative(root, SUITE)} (vector)`);
for (const [size, out] of vector) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('rsvg-convert', [
    '-w', String(size), '-h', String(size), SUITE, '-o', out,
  ]);
  console.log(`  ${size}px  →  ${path.relative(root, out)}`);
}

const { width: sw, height: sh } = await sharp(SRC).metadata();
console.log(`splash:    ${path.relative(root, SRC)} (${sw}x${sh}, on cream)`);
for (const [size, inset, out] of raster) {
  await compose(size, inset, out);
  console.log(`  ${size}px @ ${inset}  →  ${path.relative(root, out)}`);
}
console.log('✓ icons generated');
