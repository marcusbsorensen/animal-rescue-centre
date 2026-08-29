/**
 * sim-band.mjs
 *
 * Screenshot an iOS simulator and hand back just the app's own pixels,
 * at 1x, plus the arithmetic needed to turn a coordinate read off that
 * image back into a tap.
 *
 * Why this exists: a landscape-locked app on a simulator whose *device*
 * is in portrait does not fill the screen. On an iPad Air 11-inch (M4)
 * the framebuffer is 1640x2360 px (820x1180 pt) and the app renders into
 * a 1640x1140 px band with black bars above and below it. Measuring a
 * button off the raw screenshot and halving the numbers puts the tap 305
 * points too high, which reads as a dead button. This crops the bars,
 * scales to points, and prints the offset to add back.
 *
 *   node tools/sim-band.mjs <udid> [outName] [outDir]
 *
 * Writes <outDir>/<outName>-raw.png (the full framebuffer) and
 * <outDir>/<outName>.png (the app band at 1x), and prints:
 *
 *   { buffer, bandTopPx, bandHeightPx, bandImage, toScreenPt }
 *
 * `toScreenPt` is the conversion to feed a tap: read (x, y) off the band
 * image, then tap at (x, y + bandTopPx / 2).
 *
 * Rotate the simulator to landscape (Cmd+Left in Simulator.app) and the
 * bars disappear — bandTopPx comes back 0 and the conversion is identity.
 * Worth doing before concluding anything about hit areas.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const [udid, out = 'band', outDir = process.cwd()] = process.argv.slice(2);
if (!udid) {
  console.error('usage: node tools/sim-band.mjs <udid> [outName] [outDir]');
  process.exit(1);
}

const rawPath = path.join(outDir, `${out}-raw.png`);
const bandPath = path.join(outDir, `${out}.png`);

execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', rawPath], { stdio: 'ignore' });

const { data, info } = await sharp(rawPath).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// Sample every 16th column — the bars are true black, the app never is.
const rowIsBlack = (y) => {
  for (let x = 0; x < width; x += 16) {
    const i = (y * width + x) * channels;
    if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12) return false;
  }
  return true;
};
let top = 0;
while (top < height && rowIsBlack(top)) top++;
let bot = height - 1;
while (bot > top && rowIsBlack(bot)) bot--;
const bandH = bot - top + 1;

await sharp(rawPath)
  .extract({ left: 0, top, width, height: bandH })
  .resize(Math.round(width / 2))
  .toFile(bandPath);

console.log(JSON.stringify({
  buffer: `${width}x${height}`,
  bandTopPx: top,
  bandHeightPx: bandH,
  bandImage: `${Math.round(width / 2)}x${Math.round(bandH / 2)}`,
  toScreenPt: `x_pt = x_band; y_pt = y_band + ${top / 2}`,
}, null, 2));
