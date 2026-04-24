/**
 * build-mirror-mood-sprites.ts
 *
 * Generates small mood-state composites used by the rear-view-mirror
 * cargo grid in the PTV cockpit. Reads existing painted animal sprites
 * from apps/game/public/assets/animals/ and crops + resizes them into
 * tight 128×128 PNGs saved to apps/game/public/assets/driving/mirror-moods/.
 *
 * Also emits an index.json so the game / mockup can look sprites up
 * without probing the filesystem.
 *
 * Usage:
 *   pnpm tsx tools/build-mirror-mood-sprites.ts          # skip existing
 *   pnpm tsx tools/build-mirror-mood-sprites.ts --force  # rebuild all
 *
 * Design spec: docs/ptv-pet-transport-vehicle.md §"Rear-view mirror".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const SRC_DIR = resolve(repoRoot, 'apps/game/public/assets/animals');
const OUT_DIR = resolve(repoRoot, 'apps/game/public/assets/driving/mirror-moods');

type Mood = 'happy' | 'neutral' | 'stressed' | 'sleeping';
const MOODS: Mood[] = ['happy', 'neutral', 'stressed', 'sleeping'];

// v1 target species — the most-adopted ones, mapped to a preferred
// "hero" variant. Variant sprites are 512×512 with the animal filling
// the canvas; the plain `<species>-<state>.png` thumbs are only 128×128
// and include scenery, so the animal reads tiny in the mirror.
const SPECIES: Array<{ id: string; variant: string }> = [
  { id: 'cat',    variant: 'ginger'   },
  { id: 'dog',    variant: 'collie'   },
  { id: 'bunny',  variant: 'lionhead' },
  { id: 'fox',    variant: 'red'      },
  { id: 'bat',    variant: 'brown'    },
  { id: 'parrot', variant: 'macaw'    },
  { id: 'snake',  variant: 'corn'     },
];

// Mood → preferred source-state (with fallbacks if a variant is missing).
const MOOD_STATE_MAP: Record<Mood, string[]> = {
  happy:    ['sheltered', 'playing', 'arriving'],
  neutral:  ['arriving', 'walking', 'sheltered'],
  stressed: ['grumpy', 'scared', 'growling'],
  sleeping: ['sleeping', 'sheltered'],
};

const OUTPUT_SIZE = 128;
const force = process.argv.includes('--force');

type IndexEntry = {
  file: string;
  source: string;
  fallback: boolean;
};
type Index = {
  generatedAt: string;
  size: number;
  moods: Mood[];
  species: string[];
  sprites: Record<string /* species */, Partial<Record<Mood, IndexEntry>>>;
};

function pickSource(
  species: { id: string; variant: string },
  mood: Mood,
): { path: string; state: string; variant: string | null; fallback: boolean } | null {
  const candidates = MOOD_STATE_MAP[mood];
  for (let i = 0; i < candidates.length; i += 1) {
    const state = candidates[i];
    // Prefer the hi-res hero variant (512×512, animal fills canvas).
    const variantPath = resolve(SRC_DIR, `${species.id}-${species.variant}-${state}.png`);
    if (existsSync(variantPath)) {
      return { path: variantPath, state, variant: species.variant, fallback: i > 0 };
    }
    // Fall back to the plain `<species>-<state>.png` thumbnail.
    const basePath = resolve(SRC_DIR, `${species.id}-${state}.png`);
    if (existsSync(basePath)) {
      return { path: basePath, state, variant: null, fallback: true };
    }
  }
  return null;
}

async function buildOne(
  species: { id: string; variant: string },
  mood: Mood,
  outPath: string,
): Promise<IndexEntry | null> {
  const src = pickSource(species, mood);
  if (!src) {
    console.warn(`  [skip] ${species.id}/${mood} — no source sprite found`);
    return null;
  }
  // Trim transparent edges so the silhouette fills the frame,
  // then contain-fit into a square transparent canvas.
  const buf = await sharp(src.path)
    .trim({ threshold: 10 })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(outPath, buf);
  const sourceName = src.variant
    ? `${species.id}-${src.variant}-${src.state}.png`
    : `${species.id}-${src.state}.png`;
  return {
    file: `${species.id}-${mood}.png`,
    source: sourceName,
    fallback: src.fallback,
  };
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  // Preserve any existing index so skipped files don't drop from it.
  const indexPath = resolve(OUT_DIR, 'index.json');
  const prior: Index | null = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : null;

  const index: Index = {
    generatedAt: new Date().toISOString(),
    size: OUTPUT_SIZE,
    moods: MOODS,
    species: SPECIES.map((s) => s.id),
    sprites: {},
  };

  let built = 0;
  let skipped = 0;
  let missing = 0;

  for (const species of SPECIES) {
    index.sprites[species.id] = {};
    for (const mood of MOODS) {
      const file = `${species.id}-${mood}.png`;
      const outPath = resolve(OUT_DIR, file);
      let entry: IndexEntry | null = null;
      if (!force && existsSync(outPath) && prior?.sprites?.[species.id]?.[mood]) {
        entry = prior.sprites[species.id][mood]!;
        skipped += 1;
      } else {
        console.log(`  [build] ${species.id}/${mood}`);
        entry = await buildOne(species, mood, outPath);
        if (entry) built += 1;
        else missing += 1;
      }
      if (entry) {
        index.sprites[species.id]![mood] = entry;
      }
    }
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(
    `\nDone. built=${built} skipped=${skipped} missing=${missing} → ${OUT_DIR}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
