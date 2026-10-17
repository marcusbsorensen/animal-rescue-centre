// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import cacheNamesPlugin, {
  ART,
  CLEANUP_FILE,
  VOICE,
  cacheName,
  cacheNames,
  cleanupScript,
  contentHash,
  devCacheNames,
} from '../cache-names';

/**
 * The art cache and the voice cache are named after what is in them. The promises:
 *   - a release with no change in a family gets the same name (the player's cache survives);
 *   - a release that changes one file in a family gets a different name for that family only;
 *   - when the new service worker activates, the older caches of both families are deleted.
 */

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-cachenames-')));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let counter = 0;
function publicDir(files: Record<string, string | Buffer>): string {
  const dir = path.join(tmp, `pub${(counter += 1)}`);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const ART_FILES = {
  'assets/animals/cat.png': Buffer.from([1, 2, 3, 4]),
  'assets/animals/dog.png': Buffer.from([5, 6, 7, 8]),
  'assets/ui/logo.svg': '<svg/>',
  'assets/bg/field.webp': Buffer.from([9, 9, 9]),
};
const VOICE_FILES = {
  'assets/voice/marnie-001.mp3': Buffer.from([11, 12, 13]),
  'assets/voice/marnie-002.mp3': Buffer.from([21, 22, 23]),
};
const ALL = { ...ART_FILES, ...VOICE_FILES };

const artName = (dir: string) => cacheName(dir, ART);
const voiceName = (dir: string) => cacheName(dir, VOICE);

describe('the content hash and cache names', () => {
  it('have the shape <prefix>-<12 hex>', () => {
    const dir = publicDir(ALL);
    expect(artName(dir)).toMatch(/^arc-art-[0-9a-f]{12}$/);
    expect(voiceName(dir)).toMatch(/^arc-voice-[0-9a-f]{12}$/);
    expect(cacheNames(dir)).toEqual({ 'arc-art': artName(dir), 'arc-voice': voiceName(dir) });
  });

  it('are the same for the same files, however the folder was made or touched', () => {
    const a = publicDir(ALL);
    const b = publicDir(Object.fromEntries(Object.entries(ALL).reverse())); // written in another order
    const before = cacheNames(a);
    expect(cacheNames(b)).toEqual(before);
    const later = new Date(Date.now() + 86_400_000);
    for (const rel of Object.keys(ALL)) fs.utimesSync(path.join(a, rel), later, later); // a fresh checkout
    expect(cacheNames(a)).toEqual(before);
  });

  it('art ignores everything that is not art: audio, voice lines, data, overlays, code', () => {
    const before = artName(publicDir(ART_FILES));
    const withOthers = publicDir({
      ...ART_FILES,
      'assets/audio/music.mp3': 'x',
      'assets/voice/line-001.mp3': 'x',
      'assets/notes.txt': 'x',
      'data/anchors.json': '{}',
      'admin/menu.html': '<html/>',
      'assets/anything.js': 'x',
    });
    expect(artName(withOthers)).toBe(before);
  });

  it('voice looks only at mp3 files inside assets/voice/', () => {
    const before = voiceName(publicDir(VOICE_FILES));
    const withOthers = publicDir({
      ...VOICE_FILES,
      ...ART_FILES,                              // art is not voice
      'assets/audio/music.mp3': 'x',             // other audio is not voice
      'assets/voice/notes.txt': 'x',             // not an mp3
      'assets/voice/take.json': '{}',            // not an mp3
      'admin/voice-script.json': '{}',
    });
    expect(voiceName(withOthers)).toBe(before);
  });

  it('art changes with one byte in one sprite, and voice does not', () => {
    const dir = publicDir(ALL);
    const [art, voice] = [artName(dir), voiceName(dir)];
    fs.writeFileSync(path.join(dir, 'assets/animals/cat.png'), Buffer.from([1, 2, 3, 5]));
    expect(artName(dir)).not.toBe(art);
    expect(voiceName(dir)).toBe(voice);
  });

  it('voice changes with one byte in one line, and art does not', () => {
    const dir = publicDir(ALL);
    const [art, voice] = [artName(dir), voiceName(dir)];
    fs.writeFileSync(path.join(dir, 'assets/voice/marnie-002.mp3'), Buffer.from([21, 22, 99]));
    expect(voiceName(dir)).not.toBe(voice);
    expect(artName(dir)).toBe(art);
  });

  it('change when a file is added, removed or renamed', () => {
    const base = cacheNames(publicDir(ALL));
    const added = cacheNames(publicDir({ ...ALL, 'assets/animals/rabbit.png': 'new', 'assets/voice/marnie-003.mp3': 'new' }));
    expect(added['arc-art']).not.toBe(base['arc-art']);
    expect(added['arc-voice']).not.toBe(base['arc-voice']);
    const { 'assets/animals/dog.png': dog, 'assets/voice/marnie-002.mp3': line, ...rest } = ALL;
    const removed = cacheNames(publicDir(rest));
    expect(removed['arc-art']).not.toBe(base['arc-art']);
    expect(removed['arc-voice']).not.toBe(base['arc-voice']);
    const renamed = cacheNames(publicDir({ ...rest, 'assets/animals/hound.png': dog, 'assets/voice/marnie-009.mp3': line }));
    expect(renamed['arc-art']).not.toBe(base['arc-art']);
    expect(renamed['arc-voice']).not.toBe(base['arc-voice']);
  });

  it('do not mistake the same bytes in another place for the same files', () => {
    const base = contentHash(path.join(publicDir(ALL), 'assets'), ART.match);
    const { 'assets/animals/cat.png': cat, 'assets/animals/dog.png': dog, ...rest } = ALL;
    const swapped = publicDir({ ...rest, 'assets/animals/cat.png': dog, 'assets/animals/dog.png': cat });
    expect(contentHash(path.join(swapped, 'assets'), ART.match)).not.toBe(base);
  });

  it('cope with a folder with no files at all, and the voice folder not existing yet', () => {
    const dir = publicDir({ 'data/a.json': '{}' });
    expect(artName(dir)).toMatch(/^arc-art-[0-9a-f]{12}$/);
    expect(voiceName(dir)).toMatch(/^arc-voice-[0-9a-f]{12}$/);
    // The first published line changes the name from "no voice yet".
    const first = publicDir({ 'assets/voice/marnie-001.mp3': 'x' });
    expect(voiceName(first)).not.toBe(voiceName(dir));
  });

  it('the dev names are fixed, so the dev server never hashes 100 MB', () => {
    expect(devCacheNames()).toEqual({ 'arc-art': 'arc-art-dev', 'arc-voice': 'arc-voice-dev' });
  });
});

describe('the cleanup script, run the way a service worker runs it', () => {
  /** Runs the generated script against a fake cache storage and fires `activate`. */
  async function activate(current: Record<string, string>, existing: string[]): Promise<string[]> {
    const names = new Set(existing);
    const handlers: Record<string, (event: { waitUntil: (p: Promise<unknown>) => void }) => void> = {};
    const sandbox = {
      self: { addEventListener: (type: string, fn: (typeof handlers)[string]) => (handlers[type] = fn) },
      caches: {
        keys: async () => [...names],
        delete: async (name: string) => names.delete(name),
      },
    };
    vm.runInNewContext(cleanupScript(current), sandbox);
    expect(handlers.activate, 'registers an activate listener').toBeTypeOf('function');
    let pending: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (p) => (pending = p) });
    await pending;
    return [...names].sort();
  }

  const CURRENT = { 'arc-art': 'arc-art-aaaaaaaaaaaa', 'arc-voice': 'arc-voice-bbbbbbbbbbbb' };
  const [CUR_ART, CUR_VOICE] = [CURRENT['arc-art'], CURRENT['arc-voice']];

  it('deletes older art caches, older voice caches and the unversioned ones, and keeps the current two', async () => {
    const left = await activate(CURRENT, [
      'arc-art', 'arc-art-111111111111', 'arc-art-222222222222', CUR_ART,
      'arc-voice', 'arc-voice-333333333333', 'arc-voice-444444444444', CUR_VOICE,
    ]);
    expect(left).toEqual([CUR_ART, CUR_VOICE].sort());
  });

  it('a release that changed only voice deletes only the old voice caches', async () => {
    // The art name is the same as the one already stored, so it is the current one and stays.
    const left = await activate(CURRENT, [CUR_ART, 'arc-voice-333333333333', CUR_VOICE]);
    expect(left).toEqual([CUR_ART, CUR_VOICE].sort());
    const only = await activate(CURRENT, [CUR_ART, 'arc-voice-333333333333']);
    expect(only).toEqual([CUR_ART]);
  });

  it('leaves every other cache alone', async () => {
    const others = [
      'arc-audio', 'arc-overlays', 'arc-data',
      'workbox-precache-v2-https://play.arcgame.app/', 'arc-artwork-1', 'arc-voicemail-1', 'something-else',
    ];
    const left = await activate(CURRENT, ['arc-art-111111111111', 'arc-voice-333333333333', ...others, CUR_ART, CUR_VOICE]);
    expect(left).toEqual([...others, CUR_ART, CUR_VOICE].sort());
  });

  it('does nothing when there is nothing old, or on a first visit', async () => {
    expect(await activate(CURRENT, [CUR_ART, CUR_VOICE, 'arc-audio'])).toEqual(['arc-audio', CUR_ART, CUR_VOICE].sort());
    expect(await activate(CURRENT, ['arc-audio'])).toEqual(['arc-audio']);
    expect(await activate(CURRENT, [])).toEqual([]);
  });
});

describe('the generated service worker, from a real build', () => {
  function project(files: Record<string, string | Buffer>): { root: string; pub: string } {
    const root = path.join(tmp, `proj${(counter += 1)}`);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><head><title>t</title></head><body><script type="module" src="/main.js"></script></body></html>',
    );
    fs.writeFileSync(path.join(root, 'main.js'), 'console.log("hi");');
    const pub = path.join(root, 'public');
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(pub, rel)), { recursive: true });
      fs.writeFileSync(path.join(pub, rel), content);
    }
    return { root, pub };
  }

  /** The same wiring as vite.config.ts: two routes, the voice one first, and the cleanup script imported. */
  async function buildSw(root: string, pub: string) {
    const names = cacheNames(pub);
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        cacheNamesPlugin(names),
        VitePWA({
          registerType: 'autoUpdate',
          workbox: {
            globPatterns: ['**/*.{js,css,html}'],
            globIgnores: [CLEANUP_FILE],
            importScripts: [CLEANUP_FILE],
            runtimeCaching: [
              {
                urlPattern: /\/assets\/.*\.(?:png|jpg|jpeg|webp|svg)$/,
                handler: 'CacheFirst',
                options: { cacheName: names[ART.prefix] },
              },
              {
                urlPattern: /\/assets\/voice\/.*\.mp3$/,
                handler: 'CacheFirst',
                options: { cacheName: names[VOICE.prefix] },
              },
            ],
          },
        }),
      ],
      build: { outDir: 'dist', emptyOutDir: true },
    });
    const out = path.join(root, 'dist');
    return {
      sw: fs.readFileSync(path.join(out, 'sw.js'), 'utf8'),
      cleanup: fs.readFileSync(path.join(out, CLEANUP_FILE), 'utf8'),
      names,
    };
  }

  it('names both routes and the cleanup script after the same hashes, imports the script, and does not precache it', async () => {
    const { root, pub } = project(ALL);
    const { sw, cleanup, names } = await buildSw(root, pub);
    for (const name of Object.values(names)) {
      expect(sw, name).toContain(name);
      expect(cleanup, name).toContain(name);
    }
    expect(sw).toMatch(/importScripts\(["']sw-cache-cleanup\.js["']\)/);
    expect(sw).not.toMatch(/url:\s*["']sw-cache-cleanup\.js["']/);
  }, 120_000);

  it('builds twice with no change and gets the same names; one changed sprite and one changed voice line each change their own', async () => {
    const one = project(ALL);
    const two = project(ALL);
    const a = await buildSw(one.root, one.pub);
    const b = await buildSw(two.root, two.pub);
    expect(b.names).toEqual(a.names);
    expect(b.cleanup).toBe(a.cleanup);

    fs.writeFileSync(path.join(two.pub, 'assets/animals/cat.png'), Buffer.from([1, 2, 3, 99]));
    const c = await buildSw(two.root, two.pub);
    expect(c.names['arc-art']).not.toBe(a.names['arc-art']);
    expect(c.names['arc-voice']).toBe(a.names['arc-voice']);
    expect(c.sw).toContain(c.names['arc-art']);
    expect(c.sw).not.toContain(a.names['arc-art']);

    fs.writeFileSync(path.join(two.pub, 'assets/voice/marnie-001.mp3'), Buffer.from([11, 12, 77]));
    const d = await buildSw(two.root, two.pub);
    expect(d.names['arc-voice']).not.toBe(a.names['arc-voice']);
    expect(d.names['arc-voice']).not.toBe(c.names['arc-voice']);
    expect(d.names['arc-art']).toBe(c.names['arc-art']);
    expect(d.sw).not.toContain(a.names['arc-voice']);
  }, 180_000);
});
