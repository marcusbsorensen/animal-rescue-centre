#!/usr/bin/env tsx
/**
 * paint-dashboard.ts
 *
 * Calls OpenAI's /v1/images/edits endpoint with a base image + mask + prompt
 * to produce a painted dashboard that fills the unmasked region while leaving
 * the masked (interactive-slot) regions untouched.
 *
 * The input is a slot-map PNG exported from /admin/cockpit-editor.html:
 *  - Interactive controls (wheel, gauges, buttons) = solid colours
 *  - Road region (above dash-top polyline) = solid blue
 *  - Floor region (below dash-bottom polyline) = solid brown
 *  - Uncoloured (white/transparent) middle band = where OpenAI should paint
 *
 * OpenAI mask convention: transparent → painted, opaque → preserved.
 * So we invert the slot map: coloured pixels become OPAQUE; white/transparent
 * pixels become TRANSPARENT.
 *
 * NOTE: The first real run (without --dry-run) WILL consume OpenAI
 * image-edit credits. Use --dry-run first to sanity-check.
 *
 * Usage:
 *   pnpm tsx tools/paint-dashboard.ts \
 *     --slot-map apps/game/public/assets/driving/cockpit-mask-henry.png \
 *     --vehicle henry \
 *     [--prompt "..."] \
 *     [--out path.png] \
 *     [--size 1792x1024] \
 *     [--dry-run]
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// --------------------------------------------------------------------------
// Vehicle prompt library
// --------------------------------------------------------------------------

export const VEHICLE_PROMPTS: Record<string, string> = {
  trikey:
    "A child's pedal-trike handlebar rig seen from the rider's POV. Painted wooden handlebars, a wicker basket bolted to the front, a cloth map-strip draped across. Cosy, kid-scale, no real car dashboard. Painted watercolour storybook illustration in the Julia Donaldson / Axel Scheffler tradition. IMPORTANT: do NOT draw a steering wheel, gauges, pedals, ignition key, or any buttons — those are sprites overlaid separately on top. Only paint the static background surfaces (wood, wicker, cloth). Leave masked areas alone.",
  henry:
    'Cosy 1970s British delivery van dashboard seen from the driver seat. Honey-brown painted metal with cream accents, small bakelite knobs implied, a tiny handwritten "Henry" flourish on the glove-box, a tartan blanket tucked at the bottom edge, brass speedometer bezel visible in the painted art. A wooden steering-wheel column implied but NO wheel drawn. Painted watercolour storybook style matching Julia Donaldson illustrations. IMPORTANT: NO interactive controls drawn — the wheel, speedo needle, key, pedals, buttons are sprites overlaid separately. Only paint the static dashboard surfaces. Leave masked areas alone.',
  bea:
    'A slightly refined long-van dashboard seen from the driver seat. Walnut wood panelling with brass Art-Deco trim, a painted rose decal on the glove box, a small "BEA" in Art-Deco lettering across the dash, warm cream upholstery hints. Painted watercolour storybook style matching Julia Donaldson illustrations. IMPORTANT: do NOT draw a steering wheel, gauges, pedals, ignition key, horn or any buttons — those are sprites overlaid separately. Only paint the static dashboard surfaces (walnut, brass trim, decals). Leave masked areas alone.',
  'big-tilly':
    'A chunky animal-lorry cabin dashboard seen from the driver seat. Black-painted steel with chrome rivets, industrial rubber-grip switches implied, a leather seat edge visible, curtain fabric peeking at the top edge. Trucker-cosy but still friendly, painted watercolour storybook style matching Julia Donaldson illustrations. IMPORTANT: do NOT draw a steering wheel, LED digits, pedals, ignition key, air-horn button or any switches — those are sprites overlaid separately. Only paint the static cabin surfaces (black steel, rivets, leather, curtain). Leave masked areas alone.',
  spark:
    'A modern premium electric minibus dashboard seen from the driver seat. Matte-grey minimalist painted panel, cool muted tones, minimal physical detail, a hint of ambient strip-light along the top edge. Still painted watercolour (not sci-fi or CG), in the Julia Donaldson storybook tradition, just a quieter palette. IMPORTANT: do NOT draw a steering wheel, digital readouts, pedals, ignition key, chime button or any buttons — those are sprites overlaid separately. Only paint the static panel surfaces. Leave masked areas alone.',
};

// --------------------------------------------------------------------------
// CLI arg parsing
// --------------------------------------------------------------------------

interface Args {
  slotMap?: string;
  vehicle?: string;
  prompt?: string;
  out?: string;
  size: string;
  dryRun: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { size: '1792x1024', dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--slot-map':
        args.slotMap = argv[++i];
        break;
      case '--vehicle':
        args.vehicle = argv[++i];
        break;
      case '--prompt':
        args.prompt = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--size':
        args.size = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown arg: ${a}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    `paint-dashboard.ts — paint a per-vehicle cockpit dashboard via OpenAI /v1/images/edits

Usage:
  pnpm tsx tools/paint-dashboard.ts --slot-map <png> --vehicle <id> [options]

Required:
  --slot-map <path>   PNG exported from /admin/cockpit-editor.html
  --vehicle <id>      One of: ${Object.keys(VEHICLE_PROMPTS).join(', ')}

Optional:
  --prompt <text>     Override the built-in per-vehicle prompt
  --out <path>        Output path. Default: apps/game/public/assets/driving/dashboard-<vehicle>-ptv-painted.png
  --size <WxH>        OpenAI image size. Default: 1792x1024. Output is upscaled to 1920x1080.
  --dry-run           Print plan without calling the API.
  -h, --help          Show this help.

WARNING: the first real run (without --dry-run) consumes OpenAI image-edit credits.`,
  );
}

// --------------------------------------------------------------------------
// Env loader (tiny, only .env.local + process.env)
// --------------------------------------------------------------------------

export async function loadOpenAIKey(repoRoot: string): Promise<string> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const raw = await readFile(resolve(repoRoot, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.*?)\s*$/);
      if (m) {
        let v = m[1];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  } catch {
    // .env.local absent — fall through
  }
  throw new Error('OPENAI_API_KEY not found in env or .env.local');
}

// --------------------------------------------------------------------------
// Mask transform: slot-map PNG → OpenAI edit mask
//   coloured pixels   → opaque   (preserved, sprites sit here)
//   white/transparent → transparent (painted by OpenAI)
// --------------------------------------------------------------------------

export async function slotMapToEditMask(inputBuf: Buffer): Promise<Buffer> {
  const img = sharp(inputBuf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`expected 4-channel RGBA raw, got ${channels}`);
  }
  const out = Buffer.alloc(width * height * 4);
  // Threshold: a pixel is "uncoloured" (→ transparent in mask) iff it's
  // near-white AND alpha is high, OR it was fully transparent in source.
  // A pixel is "coloured" (→ opaque in mask) otherwise.
  const WHITE_THRESHOLD = 240; // 0-255; treats off-whites as white
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const isTransparent = a < 16;
    const isWhite = r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
    const shouldPaint = isTransparent || isWhite;
    // Mask output: transparent where OpenAI should paint, opaque where preserved.
    // Colour channels don't matter for the mask — set to black for clarity.
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = shouldPaint ? 0 : 255;
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// --------------------------------------------------------------------------
// Build the blank base image (solid white canvas at given dimensions)
// --------------------------------------------------------------------------

export async function buildBaseCanvas(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// --------------------------------------------------------------------------
// Multipart body builder — returns { body, boundary } so we can inspect
// for dry-run.
// --------------------------------------------------------------------------

export interface MultipartField {
  name: string;
  value: string | { filename: string; contentType: string; data: Buffer };
}

export function buildMultipart(fields: MultipartField[]): { body: Buffer; boundary: string } {
  const boundary = `----paintDashboard${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  const chunks: Buffer[] = [];
  for (const f of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (typeof f.value === 'string') {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${f.name}"\r\n\r\n`));
      chunks.push(Buffer.from(f.value));
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${f.name}"; filename="${f.value.filename}"\r\n` +
            `Content-Type: ${f.value.contentType}\r\n\r\n`,
        ),
      );
      chunks.push(f.value.data);
      chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), boundary };
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

export async function run(argv: string[], repoRoot: string): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.slotMap) throw new Error('--slot-map is required (use --help for usage)');
  if (!args.vehicle) throw new Error('--vehicle is required (use --help for usage)');

  const prompt = args.prompt ?? VEHICLE_PROMPTS[args.vehicle];
  if (!prompt) {
    throw new Error(
      `no built-in prompt for vehicle '${args.vehicle}'. Known: ${Object.keys(VEHICLE_PROMPTS).join(
        ', ',
      )}. Pass --prompt to override.`,
    );
  }

  const outPath = resolve(
    repoRoot,
    args.out ?? `apps/game/public/assets/driving/dashboard-${args.vehicle}-ptv-painted.png`,
  );
  const slotMapPath = resolve(repoRoot, args.slotMap);

  const sizeMatch = args.size.match(/^(\d+)x(\d+)$/);
  if (!sizeMatch) throw new Error(`--size must be WxH (e.g. 1792x1024), got '${args.size}'`);
  const apiWidth = parseInt(sizeMatch[1], 10);
  const apiHeight = parseInt(sizeMatch[2], 10);

  console.log(`paint-dashboard: vehicle=${args.vehicle}`);
  console.log(`  slot-map : ${slotMapPath}`);
  console.log(`  out      : ${outPath}`);
  console.log(`  size     : ${apiWidth}x${apiHeight} → resized to ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`);
  console.log(`  prompt   : ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`);

  // Load & transform slot-map → edit mask
  const slotMapBuf = await readFile(slotMapPath);
  const slotMeta = await sharp(slotMapBuf).metadata();
  if (slotMeta.width !== apiWidth || slotMeta.height !== apiHeight) {
    console.log(
      `  note: slot-map is ${slotMeta.width}x${slotMeta.height}; resizing to API size ${apiWidth}x${apiHeight}`,
    );
  }
  const resizedSlotMap = await sharp(slotMapBuf)
    .resize(apiWidth, apiHeight, { fit: 'fill' })
    .png()
    .toBuffer();
  const maskBuf = await slotMapToEditMask(resizedSlotMap);
  const baseBuf = await buildBaseCanvas(apiWidth, apiHeight);

  const fields: MultipartField[] = [
    { name: 'model', value: 'gpt-image-1' },
    { name: 'prompt', value: prompt },
    { name: 'size', value: args.size },
    { name: 'n', value: '1' },
    {
      name: 'image',
      value: { filename: 'base.png', contentType: 'image/png', data: baseBuf },
    },
    {
      name: 'mask',
      value: { filename: 'mask.png', contentType: 'image/png', data: maskBuf },
    },
  ];
  const { body, boundary } = buildMultipart(fields);

  if (args.dryRun) {
    console.log('--- dry-run ---');
    console.log(`  POST https://api.openai.com/v1/images/edits`);
    console.log(`  Content-Type: multipart/form-data; boundary=${boundary}`);
    console.log(`  body bytes: ${body.length.toLocaleString()}`);
    console.log(`  fields    :`);
    for (const f of fields) {
      if (typeof f.value === 'string') {
        console.log(`    - ${f.name}: ${f.value.length > 80 ? f.value.slice(0, 77) + '…' : f.value}`);
      } else {
        console.log(
          `    - ${f.name}: <file ${f.value.filename} ${f.value.contentType} ${f.value.data.length}B>`,
        );
      }
    }
    console.log('(no API call made; no credits consumed)');
    return;
  }

  const apiKey = await loadOpenAIKey(repoRoot);
  console.log('  calling OpenAI /v1/images/edits …');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed: ${res.status} ${res.statusText}\n${errText}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = json.data?.[0];
  if (!first) throw new Error(`OpenAI response has no data: ${JSON.stringify(json).slice(0, 400)}`);
  let pngBuf: Buffer;
  if (first.b64_json) {
    pngBuf = Buffer.from(first.b64_json, 'base64');
  } else if (first.url) {
    const dl = await fetch(first.url);
    pngBuf = Buffer.from(await dl.arrayBuffer());
  } else {
    throw new Error(`no b64_json or url in OpenAI response`);
  }

  const upscaled = await sharp(pngBuf)
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'fill' })
    .png()
    .toBuffer();
  await writeFile(outPath, upscaled);
  const { size } = await stat(outPath);
  console.log(`Painted dashboard saved to ${outPath} (${Math.round(size / 1024)} KB)`);
}

// --------------------------------------------------------------------------
// Entry point (skip when imported by tests)
// --------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const isEntry = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isEntry) {
  run(process.argv.slice(2), repoRoot).catch((err) => {
    console.error(`paint-dashboard: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
