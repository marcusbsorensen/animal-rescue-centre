/**
 * build-icons.mjs — rasterise the interface icon set.
 *
 *   node tools/icons/build-icons.mjs            # write the PNGs
 *   node tools/icons/build-icons.mjs --sheet    # …and a contact sheet
 *
 * Writes 96x96 PNGs (4x the 24px the game draws them at, so they hold up
 * on a 3x screen) into apps/game/public/assets/icons/.
 *
 * `rsvg-convert` does the rasterising. It is in the Homebrew librsvg
 * formula and is the only external dependency here; the alternative is a
 * headless browser, which is a lot of machinery for a 24px square.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svgFor, allNames, ICONS, ALIASES } from './icon-set.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const outDir = path.join(repo, 'apps/game/public/assets/icons');
const tmpDir = path.join(repo, 'tools/icons/.tmp');
const SIZE = 96;

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const names = allNames();
let written = 0;
for (const name of names) {
  const svgPath = path.join(tmpDir, `${name}.svg`);
  fs.writeFileSync(svgPath, svgFor(name, SIZE));
  execFileSync('rsvg-convert', [
    '-w', String(SIZE), '-h', String(SIZE),
    '-o', path.join(outDir, `${name}.png`),
    svgPath,
  ]);
  written++;
}
console.log(`wrote ${written} icons (${Object.keys(ICONS).length} drawn, ${Object.keys(ALIASES).length} aliased) to ${path.relative(repo, outDir)}`);

if (process.argv.includes('--sheet')) {
  // A contact sheet at BOTH sizes. 96px says whether the drawing is any
  // good; 24px — the size a child actually sees — says whether it is any
  // use, and those are different questions. Anything that reads at 96 and
  // dies at 24 has failed the only test that matters here.
  const drawn = Object.keys(ICONS);
  const cols = 8;
  const rows = Math.ceil(drawn.length / cols);
  const CELL = 128;
  const cells = drawn.map((name, i) => {
    const x = (i % cols) * CELL;
    const y = Math.floor(i / cols) * CELL;
    return (
      `<g transform="translate(${x},${y})">` +
      `<rect width="${CELL}" height="${CELL}" fill="${i % 2 ? '#f6efe3' : '#efe6d6'}"/>` +
      // 96px — is it well drawn?
      `<g transform="translate(10,14) scale(2.6)" >${inner(name)}</g>` +
      // 24px — is it legible?
      `<g transform="translate(90,84)">${inner(name)}</g>` +
      `<text x="6" y="122" font-family="ui-monospace,monospace" font-size="8" fill="#6b5a4a">${name}</text>` +
      `</g>`
    );
  });
  const sheet =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CELL}" height="${rows * CELL}">` +
    `<rect width="100%" height="100%" fill="#efe6d6"/>${cells.join('')}</svg>`;
  const sheetSvg = path.join(tmpDir, 'sheet.svg');
  fs.writeFileSync(sheetSvg, sheet);
  const sheetPng = path.join(repo, 'icon-sheet.png');
  execFileSync('rsvg-convert', ['-o', sheetPng, sheetSvg]);
  console.log(`contact sheet → ${path.relative(repo, sheetPng)} (each cell: 96px left, 24px right)`);
}

/** The icon's shapes, in the game's ink so they read on the sheet. */
function inner(name) {
  return svgFor(name)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/#fff/g, '#3a2e22');
}
