import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createVoiceBoothHandler } from '../plugins/voice-booth-handler';

/**
 * The voice booth page, driven in a real browser against the real save
 * endpoint, with no Vite involved: a small server here serves public/ and
 * mounts the same handler the dev plugin mounts, saving into a temp folder
 * (never apps/game/voice-takes/). So this runs whether or not the dev server in
 * use has been restarted with the plugin.
 *
 * The microphone is stood in for by a tone made in the page: headless Chrome
 * here never answers getUserMedia, even with fake devices. Everything the
 * booth does with the stream (MediaRecorder, upload, playback, keep) is real.
 */

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json' };

let server: http.Server;
let base: string;
let takes: string;

test.beforeAll(async () => {
  takes = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-booth-e2e-'));
  const handler = createVoiceBoothHandler({ dir: takes });
  server = http.createServer((req, res) => {
    handler(req, res, () => {
      const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const file = path.join(PUBLIC, pathname);
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(takes, { recursive: true, force: true });
});

test('records, plays back, retakes and keeps a line, and refuses what it should', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      osc.frequency.value = 220;
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
  await page.goto(`${base}/admin/voice-booth.html`);
  await expect(page.locator('#server-banner')).toContainText('Saving is on');

  // Marnie first, every household after her; two lines each.
  const speakers = page.locator('details.speaker');
  expect(await speakers.count()).toBe(30);
  expect(await page.locator('.line').count()).toBe(60);
  await expect(speakers.first().locator('.who')).toHaveText('Marnie');

  const line = page.locator('.line').first();
  await expect(line.locator('.lineid')).toContainText('handover-warden-1');

  // Nothing is recorded until someone has said who they are and agreed.
  await expect(line.locator('button.rec')).toBeDisabled();
  await page.fill('#by', 'Test Speaker');
  await page.check('#consent');
  await expect(line.locator('button.rec')).toBeEnabled();

  // A line that needs the animal's name cannot be recorded.
  await page.selectOption('#version', 'current');
  await expect(line.locator('button.rec')).toBeDisabled();
  await expect(line.locator('.state')).toContainText("animal's name");
  await page.selectOption('#version', 'name-free');
  await expect(line.locator('button.rec')).toBeEnabled();

  // Two takes.
  for (let n = 1; n <= 2; n++) {
    await line.locator('button.rec').click();
    await expect(line.locator('button.rec')).toHaveText('Stop');
    await page.waitForTimeout(1200);
    await line.locator('button.rec').click();
    await expect(line.locator('.take')).toHaveCount(n);
  }
  expect(fs.readdirSync(path.join(takes, 'raw/warden')).sort()).toEqual([
    'handover-warden-1__take1.webm',
    'handover-warden-1__take2.webm',
  ]);

  // Play one back, keep it.
  await line.locator('.take').nth(1).locator('button').first().click();
  await expect(line.locator('button.keep')).toBeEnabled();
  await line.locator('button.keep').click();
  await expect(line.locator('.take.kept')).toHaveCount(1);
  const sidecar = JSON.parse(fs.readFileSync(path.join(takes, 'keep/handover-warden-1.json'), 'utf8'));
  expect(sidecar).toMatchObject({
    lineId: 'handover-warden-1', speakerId: 'warden', takeFile: 'handover-warden-1__take2.webm',
    by: 'Test Speaker', consent: true, textVersion: 'name-free',
  });
  expect(sidecar.text).toBe('Meet our little friend! This one has been hoping for the perfect home.');
  expect(fs.existsSync(path.join(takes, 'keep/handover-warden-1.webm'))).toBe(true);

  // The game does not show those words yet, and the page says so.
  await expect(line.locator('.state')).toContainText('will not ship until the game text is changed');
  await expect(page.locator('#progress')).toContainText('1 of 60 lines kept');

  // Progress survives a reload, because it lives on the server.
  await page.reload();
  await expect(page.locator('#progress')).toContainText('1 of 60 lines kept');
});
