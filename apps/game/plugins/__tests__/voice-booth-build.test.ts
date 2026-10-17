// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import voiceBoothPlugin, { BOOTH_FILES } from '../voice-booth';

/**
 * The booth is a dev tool and must not exist in production. Its page lives in
 * public/admin/ (so the dev server serves it with no config), and a build copies
 * public/ whole, so the plugin takes it back out. This runs a real `vite build`
 * of a tiny project, into two different output folders (the web build and the
 * iOS build use different --outDir), and looks at what comes out.
 *
 * No dev server is started: `build` is the library call behind `vite build`.
 */

// realpath: on macOS os.tmpdir() is a symlink, and Vite resolves index.html through it.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-boothbuild-')));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function project(): string {
  const root = path.join(tmp, `p${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(path.join(root, 'public/admin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>t</title><script type="module" src="/main.js"></script>');
  fs.writeFileSync(path.join(root, 'main.js'), 'console.log("hi");');
  fs.writeFileSync(path.join(root, 'public/admin/voice-booth.html'), '<!doctype html><title>booth</title>');
  fs.writeFileSync(path.join(root, 'public/admin/voice-script.json'), '{"speakers":[]}');
  fs.writeFileSync(path.join(root, 'public/admin/adoption.html'), '<!doctype html><title>ceremony</title>');
  return root;
}

async function buildInto(root: string, outDir: string): Promise<string> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [voiceBoothPlugin()],
    build: { outDir, emptyOutDir: true },
  });
  return path.resolve(root, outDir);
}

describe('the voice booth in a production build', () => {
  it('is left out of dist, and everything else in public/admin/ is kept', async () => {
    const root = project();
    const out = await buildInto(root, 'dist');
    for (const f of BOOTH_FILES) expect(fs.existsSync(path.join(out, f)), f).toBe(false);
    expect(fs.existsSync(path.join(out, 'admin/adoption.html'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(true);
  }, 60_000);

  it('is left out of the iOS build too, wherever --outDir puts it', async () => {
    const root = project();
    const out = await buildInto(root, 'dist-ios');
    for (const f of BOOTH_FILES) expect(fs.existsSync(path.join(out, f)), f).toBe(false);
    expect(fs.existsSync(path.join(out, 'admin/adoption.html'))).toBe(true);
  }, 60_000);

  it('does not touch public/, so the dev server still serves the page', async () => {
    const root = project();
    await buildInto(root, 'dist');
    for (const f of BOOTH_FILES) expect(fs.existsSync(path.join(root, 'public', f)), f).toBe(true);
  }, 60_000);

  it('would have shipped without the plugin (the check can fail)', async () => {
    const root = project();
    await build({ root, configFile: false, logLevel: 'silent', build: { outDir: 'dist', emptyOutDir: true } });
    expect(fs.existsSync(path.join(root, 'dist/admin/voice-booth.html'))).toBe(true);
  }, 60_000);
});
