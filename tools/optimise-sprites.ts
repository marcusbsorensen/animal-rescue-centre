/**
 * optimise-sprites.ts
 *
 * Two-pass PNG slimming for the runtime asset folders, run in place so no
 * path anywhere has to change.
 *
 *   1. Downsample anything above --max (default 512) on its longest edge.
 *      The `-playing` animal sprites came back from the art pass at
 *      1024x1024 while every other state was 512x512 — at ~1.5 MB each
 *      they were 44% of the whole animal payload, for art that never
 *      renders larger than about 128 px.
 *   2. Palette-quantise at quality 90. On this painted-storybook art that
 *      is around 69% off the file size with no visible difference at
 *      display size — checked side by side on soft-gradient subjects
 *      (sleeping fox, macaw plumage) before it was adopted.
 *
 * Both passes are idempotent: already-small files are left alone, and
 * re-quantising an already-quantised PNG is a no-op in practice. Safe to
 * re-run after any art drop.
 *
 *   pnpm tsx tools/optimise-sprites.ts                     # dry run, animals
 *   pnpm tsx tools/optimise-sprites.ts --write             # apply
 *   pnpm tsx tools/optimise-sprites.ts bg driving --write  # other folders
 *   pnpm tsx tools/optimise-sprites.ts --max=768 --write   # different cap
 *
 * --base= points the run at a different tree. The cast portraits are
 * runtime art that lives under public/admin/ for historical reasons, so
 * they need the same pass without being moved:
 *
 *   pnpm tsx tools/optimise-sprites.ts --base=apps/game/public/admin/scene-assets cast --write
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const MAX = Number(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 512);
const ASSETS = args.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'apps/game/public/assets';
const folders = args.filter((a) => !a.startsWith('--'));
const TARGETS = folders.length > 0 ? folders : ['animals'];

const mb = (b: number) => (b / 1048576).toFixed(1);
const kb = (b: number) => (b / 1024).toFixed(0);

async function optimiseFolder(folder: string): Promise<{ before: number; after: number; resized: number; files: number }> {
  const dir = path.join(ASSETS, folder);
  if (!fs.existsSync(dir)) {
    console.log(`  (no such folder: ${dir})`);
    return { before: 0, after: 0, resized: 0, files: 0 };
  }

  // Recurse — driving/ keeps vehicles, topdown and destinations in
  // subfolders, and they carry most of that folder's weight.
  const files: string[] = [];
  (function walk(d: string): void {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.png')) files.push(p);
    }
  })(dir);

  let before = 0;
  let after = 0;
  let resized = 0;

  for (const full of files) {
    const file = path.relative(dir, full);
    const origBytes = fs.statSync(full).size;
    before += origBytes;

    const { width = 0, height = 0 } = await sharp(full).metadata();
    const needsResize = Math.max(width, height) > MAX;

    // Build into a buffer first — sharp cannot read and write one path in
    // a single pipeline.
    let pipeline = sharp(full);
    if (needsResize) {
      pipeline = pipeline.resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true });
      resized += 1;
    }
    const buf = await pipeline.png({ palette: true, quality: 90, effort: 10 }).toBuffer();

    // Never let an "optimisation" make a file bigger.
    if (buf.length >= origBytes && !needsResize) {
      after += origBytes;
      continue;
    }

    after += buf.length;
    if (WRITE) fs.writeFileSync(full, buf);
    if (needsResize) {
      console.log(`    ${width}x${height} → ${MAX}px  ${kb(origBytes)} → ${kb(buf.length)} KB  ${file}`);
    }
  }

  return { before, after, resized, files: files.length };
}

async function main(): Promise<void> {
  console.log(WRITE ? `Optimising (max ${MAX}px, palette q90):` : `Dry run (max ${MAX}px, palette q90) — pass --write to apply:`);

  let before = 0;
  let after = 0;
  for (const folder of TARGETS) {
    console.log(`\n  ${folder}/`);
    const r = await optimiseFolder(folder);
    before += r.before;
    after += r.after;
    const saved = r.before - r.after;
    console.log(
      `    ${r.files} files, ${r.resized} oversized. ` +
      `${mb(r.before)} MB → ${mb(r.after)} MB (${saved > 0 ? '−' : '+'}${mb(Math.abs(saved))} MB)`,
    );
  }

  if (TARGETS.length > 1) {
    console.log(`\nTotal: ${mb(before)} MB → ${mb(after)} MB (saved ${mb(before - after)} MB).`);
  }
  if (!WRITE) console.log('\nNothing written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
