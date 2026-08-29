#!/usr/bin/env node
/**
 * Generate every icon the game needs from the one logo master.
 *
 * Before this existed, public/icons/icon-192.png and icon-512.png were
 * 11-byte files containing the ASCII string "placeholder", so the PWA
 * manifest had been pointing at dead icons since April.
 *
 * Source is the 512px heart-paw mark. That is smaller than the 1024px
 * Apple wants for an App Store icon, so the app icon is upscaled ~1.3x
 * and will be slightly soft on a 3x display. Fine for development
 * builds; regenerate the master at 1024px before submission.
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const targets = [
  // iOS app icon. Single 1024 slot since Xcode 14.
  [1024, 0.66, path.join(XCASSETS, 'AppIcon.appiconset/AppIcon-512@2x.png')],

  // PWA manifest icons — these were the "placeholder" files.
  [192, 0.7, path.join(ICONS, 'icon-192.png')],
  [512, 0.7, path.join(ICONS, 'icon-512.png')],

  // Home-screen icon for the web clip / standalone PWA. Without a
  // <link rel="apple-touch-icon"> pointing at one of these, iOS falls back to
  // a grey letter tile — which is what "Add to Home Screen" produced on the
  // simulator on 2026-08-29. 180px is the size Safari asks for.
  [180, 0.7, path.join(ICONS, 'apple-touch-icon.png')],

  // Maskable: Android and some launchers crop to a circle, so the mark
  // sits inside the inner 80% safe zone with room to be cut.
  [512, 0.52, path.join(ICONS, 'icon-512-maskable.png')],

  // Launch screen. Small mark on a wide cream field — this is what shows
  // in the beat before Phaser paints, so it must match the game's ground.
  [2732, 0.16, path.join(XCASSETS, 'Splash.imageset/splash-2732x2732.png')],
  [2732, 0.16, path.join(XCASSETS, 'Splash.imageset/splash-2732x2732-1.png')],
  [2732, 0.16, path.join(XCASSETS, 'Splash.imageset/splash-2732x2732-2.png')],
];

const { width: sw, height: sh } = await sharp(SRC).metadata();
console.log(`source: ${path.relative(root, SRC)} (${sw}x${sh})`);
if (sw < 1024 || sh < 1024) {
  console.log('  note: below 1024px — app icon is upscaled and will be soft.');
}

for (const [size, inset, out] of targets) {
  await compose(size, inset, out);
  console.log(`  ${size}px @ ${inset}  →  ${path.relative(root, out)}`);
}
console.log('✓ icons generated');
