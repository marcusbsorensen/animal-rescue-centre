// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import artCachePlugin, {
  ART_CACHE_PREFIX,
  CLEANUP_FILE,
  artCacheName,
  artContentHash,
  cleanupScript,
} from '../art-cache';

/**
 * The art cache is named after the art in it. The promises:
 *   - a release with no art change gets the same name (the player's cache survives);
 *   - a release that changes one sprite gets a different name;
 *   - when the new service worker activates, the older art caches are deleted.
 */

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-artcache-')));
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

const ART = {
  'assets/animals/cat.png': Buffer.from([1, 2, 3, 4]),
  'assets/animals/dog.png': Buffer.from([5, 6, 7, 8]),
  'assets/ui/logo.svg': '<svg/>',
  'assets/bg/field.webp': Buffer.from([9, 9, 9]),
};

describe('the art content hash and cache name', () => {
  it('has the shape arc-art-<12 hex>', () => {
    expect(artCacheName(publicDir(ART))).toMatch(/^arc-art-[0-9a-f]{12}$/);
  });

  it('is the same for the same art, however the folder was made or touched', () => {
    const a = publicDir(ART);
    const b = publicDir(Object.fromEntries(Object.entries(ART).reverse())); // written in another order
    const before = artCacheName(a);
    expect(artCacheName(b)).toBe(before);
    const later = new Date(Date.now() + 86_400_000);
    for (const rel of Object.keys(ART)) fs.utimesSync(path.join(a, rel), later, later); // a fresh checkout
    expect(artCacheName(a)).toBe(before);
  });

  it('ignores everything that is not art: audio, voice lines, data, overlays, code', () => {
    const before = artCacheName(publicDir(ART));
    const withOthers = publicDir({
      ...ART,
      'assets/audio/music.mp3': 'x',
      'assets/voice/line-001.mp3': 'x',
      'assets/notes.txt': 'x',
      'data/anchors.json': '{}',
      'admin/menu.html': '<html/>',
      'assets/anything.js': 'x',
    });
    expect(artCacheName(withOthers)).toBe(before);
  });

  it('changes when one sprite changes, by a single byte', () => {
    const dir = publicDir(ART);
    const before = artCacheName(dir);
    fs.writeFileSync(path.join(dir, 'assets/animals/cat.png'), Buffer.from([1, 2, 3, 5]));
    expect(artCacheName(dir)).not.toBe(before);
  });

  it('changes when art is added, removed or renamed', () => {
    const base = artCacheName(publicDir(ART));
    const added = publicDir({ ...ART, 'assets/animals/rabbit.png': 'new' });
    expect(artCacheName(added)).not.toBe(base);
    const { 'assets/animals/dog.png': _gone, ...fewer } = ART;
    expect(artCacheName(publicDir(fewer))).not.toBe(base);
    const { 'assets/animals/dog.png': dog, ...rest } = ART;
    expect(artCacheName(publicDir({ ...rest, 'assets/animals/hound.png': dog }))).not.toBe(base);
  });

  it('does not mistake the same bytes in another place for the same art', () => {
    const base = artContentHash(path.join(publicDir(ART), 'assets'));
    const { 'assets/animals/cat.png': cat, 'assets/animals/dog.png': dog, ...rest } = ART;
    const swapped = publicDir({ ...rest, 'assets/animals/cat.png': dog, 'assets/animals/dog.png': cat });
    expect(artContentHash(path.join(swapped, 'assets'))).not.toBe(base);
  });

  it('copes with a folder with no art at all', () => {
    expect(artCacheName(publicDir({ 'data/a.json': '{}' }))).toMatch(/^arc-art-[0-9a-f]{12}$/);
  });
});

describe('the cleanup script, run the way a service worker runs it', () => {
  /** Runs the generated script against a fake cache storage and fires `activate`. */
  async function activate(current: string, existing: string[]): Promise<string[]> {
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

  const CURRENT = `${ART_CACHE_PREFIX}-aaaaaaaaaaaa`;

  it('deletes older art caches and the unversioned one, and keeps the current one', async () => {
    const left = await activate(CURRENT, [
      'arc-art',
      'arc-art-111111111111',
      'arc-art-222222222222',
      CURRENT,
    ]);
    expect(left).toEqual([CURRENT]);
  });

  it('leaves every other cache alone', async () => {
    const others = [
      'arc-voice', 'arc-audio', 'arc-overlays', 'arc-data',
      'workbox-precache-v2-https://play.arcgame.app/', 'arc-artwork-1', 'something-else',
    ];
    const left = await activate(CURRENT, ['arc-art-111111111111', ...others, CURRENT]);
    expect(left).toEqual([...others, CURRENT].sort());
  });

  it('does nothing when there is nothing old', async () => {
    expect(await activate(CURRENT, [CURRENT, 'arc-audio'])).toEqual(['arc-audio', CURRENT].sort());
  });

  it('works when this release is the first (no art cache yet)', async () => {
    expect(await activate(CURRENT, ['arc-audio'])).toEqual(['arc-audio']);
  });
});

describe('the generated service worker, from a real build', () => {
  function project(art: Record<string, string | Buffer>): { root: string; pub: string } {
    const root = path.join(tmp, `proj${(counter += 1)}`);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><head><title>t</title></head><body><script type="module" src="/main.js"></script></body></html>',
    );
    fs.writeFileSync(path.join(root, 'main.js'), 'console.log("hi");');
    const pub = path.join(root, 'public');
    for (const [rel, content] of Object.entries(art)) {
      fs.mkdirSync(path.dirname(path.join(pub, rel)), { recursive: true });
      fs.writeFileSync(path.join(pub, rel), content);
    }
    return { root, pub };
  }

  async function buildSw(root: string, pub: string): Promise<{ sw: string; cleanup: string; name: string }> {
    const name = artCacheName(pub);
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        artCachePlugin(name),
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
                options: { cacheName: name },
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
      name,
    };
  }

  it('names the art route and the cleanup script after the same hash, imports the script, and does not precache it', async () => {
    const { root, pub } = project(ART);
    const { sw, cleanup, name } = await buildSw(root, pub);
    expect(sw).toContain(name);
    expect(sw).toMatch(/importScripts\(["']sw-art-cleanup\.js["']\)/);
    expect(cleanup).toContain(name);
    expect(sw).not.toMatch(/url:\s*["']sw-art-cleanup\.js["']/);
  }, 120_000);

  it('builds twice with no art change and gets the same name; one changed sprite gets another', async () => {
    const one = project(ART);
    const two = project(ART);
    const a = await buildSw(one.root, one.pub);
    const b = await buildSw(two.root, two.pub);
    expect(b.name).toBe(a.name);
    expect(b.cleanup).toBe(a.cleanup);

    fs.writeFileSync(path.join(two.pub, 'assets/animals/cat.png'), Buffer.from([1, 2, 3, 99]));
    const c = await buildSw(two.root, two.pub);
    expect(c.name).not.toBe(a.name);
    expect(c.sw).toContain(c.name);
    expect(c.sw).not.toContain(a.name);
  }, 180_000);
});
