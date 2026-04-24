#!/usr/bin/env tsx
/**
 * Light tests for paint-dashboard.ts — run with:
 *   pnpm tsx --test tools/paint-dashboard.test.ts
 *
 * Covers:
 *   - slotMapToEditMask: white region → transparent, coloured region → opaque
 *   - buildMultipart: body contains the expected fields & file parts
 *   - parseArgs: basic flag handling
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import {
  slotMapToEditMask,
  buildMultipart,
  parseArgs,
  VEHICLE_PROMPTS,
} from './paint-dashboard.ts';

async function makeFixture(): Promise<Buffer> {
  // 4x2 image: left half solid white (should become transparent in mask),
  // right half solid red (should become opaque in mask).
  const width = 4;
  const height = 2;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x < 2) {
        raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 255;
      } else {
        raw[i] = 220; raw[i + 1] = 30; raw[i + 2] = 30; raw[i + 3] = 255;
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test('slotMapToEditMask: white → transparent, coloured → opaque', async () => {
  const fixture = await makeFixture();
  const maskPng = await slotMapToEditMask(fixture);
  const { data, info } = await sharp(maskPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 4);
  assert.equal(info.height, 2);
  assert.equal(info.channels, 4);

  // Left half (was white) should be transparent (alpha 0)
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const alpha = data[(y * 4 + x) * 4 + 3];
      assert.equal(alpha, 0, `expected transparent at (${x},${y}), got alpha=${alpha}`);
    }
  }
  // Right half (was red) should be opaque (alpha 255)
  for (let y = 0; y < 2; y++) {
    for (let x = 2; x < 4; x++) {
      const alpha = data[(y * 4 + x) * 4 + 3];
      assert.equal(alpha, 255, `expected opaque at (${x},${y}), got alpha=${alpha}`);
    }
  }
});

test('buildMultipart: body contains fields and file parts', () => {
  const { body, boundary } = buildMultipart([
    { name: 'model', value: 'gpt-image-1' },
    { name: 'prompt', value: 'hello' },
    { name: 'image', value: { filename: 'base.png', contentType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) } },
  ]);
  const s = body.toString('binary');
  assert.ok(boundary.length > 10, 'boundary should be non-trivial');
  assert.ok(s.includes(`--${boundary}`), 'body includes boundary');
  assert.ok(s.includes('name="model"'), 'has model field');
  assert.ok(s.includes('gpt-image-1'), 'model value present');
  assert.ok(s.includes('name="prompt"'), 'has prompt field');
  assert.ok(s.includes('hello'), 'prompt value present');
  assert.ok(s.includes('name="image"'), 'has image field');
  assert.ok(s.includes('filename="base.png"'), 'image filename present');
  assert.ok(s.includes('Content-Type: image/png'), 'image content-type present');
  assert.ok(s.endsWith(`--${boundary}--\r\n`), 'terminates with closing boundary');
});

test('parseArgs: required flags parse correctly', () => {
  const a = parseArgs([
    '--slot-map', 'foo.png',
    '--vehicle', 'henry',
    '--dry-run',
  ]);
  assert.equal(a.slotMap, 'foo.png');
  assert.equal(a.vehicle, 'henry');
  assert.equal(a.dryRun, true);
  assert.equal(a.size, '1792x1024'); // default
});

test('VEHICLE_PROMPTS: all five vehicles covered', () => {
  for (const v of ['trikey', 'henry', 'bea', 'big-tilly', 'spark']) {
    assert.ok(VEHICLE_PROMPTS[v], `missing prompt for ${v}`);
    assert.ok(VEHICLE_PROMPTS[v].includes('NO') || VEHICLE_PROMPTS[v].includes('do NOT'),
      `prompt for ${v} should tell the model NOT to draw controls`);
  }
});
