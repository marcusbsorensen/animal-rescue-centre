// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import assetManifestPlugin from '../asset-manifest';
import pruneDevOnlyPlugin from '../prune-dev-only';
import { DEV_ONLY, WEB_ONLY, rsyncExcludes } from '../prune-list.mjs';
import { BOOTH_FILES } from '../voice-booth';

/**
 * The prune list (plugins/prune-list.mjs) is a claim: "the game never reaches
 * these files". This test checks the claim against the real source, and runs
 * the plugin in a real (tiny) build.
 *
 * The reference audit: start from every string in the game's code (comments
 * stripped) and from index.html, follow every file reference inside the html,
 * js, css and json files that turns up, and collect what is reached. A listed
 * file must not be in that set; an admin page must be in it or be listed.
 *
 * What it cannot see: names built at run time (`${pose}.png`). That is why the
 * list never names admin/scene-assets/, whose art is loaded that way.
 */

const gameDir = fileURLToPath(new URL('../..', import.meta.url));
const publicDir = path.join(gameDir, 'public');

// ---- the audit ---------------------------------------------------------------

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

const stripBlock = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripLine = (s: string) => s.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const stripHtmlComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');

const FILE_REF =
  /(?:["'`(=\s])((?:\.{0,2}\/)?(?:[A-Za-z0-9_@~.-]+\/)*[A-Za-z0-9_@~.-]+\.(?:html|js|mjs|css|json|png|jpg|jpeg|webp|svg|mp3|ogg|woff2|gif))(?=[?#"'`)\s;,]|$)/g;
const DIR_REF = /["'`(](\/?admin\/[A-Za-z0-9_./-]*\/)["'`)]/g;

function referencesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(FILE_REF)) out.add(m[1]);
  for (const m of text.matchAll(DIR_REF)) out.add(m[1]);
  return out;
}

/** Paths under public/ (relative, forward slashes) that the game can reach. */
export function reachableFiles(srcDir: string, pubDir: string, indexHtml: string): Set<string> {
  const reached = new Set<string>();
  const queue: string[] = [];

  const add = (raw: string, from: string | null) => {
    const ref = raw.split(/[?#]/)[0];
    const abs = ref.startsWith('/') || !from ? path.join(pubDir, ref) : path.resolve(path.dirname(from), ref);
    if (!abs.startsWith(pubDir) || !fs.existsSync(abs)) return;
    const files = fs.statSync(abs).isDirectory() ? [...walk(abs)] : [abs];
    for (const f of files) {
      const rel = path.relative(pubDir, f).split(path.sep).join('/');
      if (!reached.has(rel)) {
        reached.add(rel);
        queue.push(f);
      }
    }
  };

  for (const f of walk(srcDir)) {
    if (!f.endsWith('.ts') || f.includes(`${path.sep}__tests__${path.sep}`) || f.endsWith('.test.ts')) continue;
    for (const r of referencesIn(stripLine(stripBlock(fs.readFileSync(f, 'utf8'))))) add(r, null);
  }
  for (const r of referencesIn(stripHtmlComments(fs.readFileSync(indexHtml, 'utf8')))) add(r, null);

  while (queue.length > 0) {
    const f = queue.shift() as string;
    if (!/\.(html|js|mjs|css|json)$/.test(f)) continue;
    let text = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.html')) text = stripLine(stripBlock(stripHtmlComments(text)));
    else if (f.endsWith('.css')) text = stripBlock(text);
    else if (f.endsWith('.js') || f.endsWith('.mjs')) text = stripLine(stripBlock(text));
    for (const r of referencesIn(text)) add(r, f);
  }
  return reached;
}

/** Is `file` (relative to the build) covered by a DEV_ONLY entry? */
function isListed(file: string, list: string[] = DEV_ONLY): boolean {
  return list.some((e) => (e.endsWith('/') ? file.startsWith(e) : file === e));
}

const reachable = reachableFiles(path.join(gameDir, 'src'), publicDir, path.join(gameDir, 'index.html'));

// The overlay pages the game's two loaders name (AuthOverlay.ts, InGameOverlay.ts).
const OVERLAY_PAGES = [
  'welcome', 'login', 'signup', 'welcome-new', 'menu', 'friends', 'forgot-pin', 'intro',
  'paths', 'adopters', 'adoption', 'adoption-office', 'rewilding', 'conflict', 'visitor', 'vet',
  'arrival', 'badge', 'map', 'drive-overlay', 'tunnel', 'charm-select',
].map((n) => `admin/${n}.html`);

describe('the prune list against the real source', () => {
  it('the audit sees the pages the game loads (so a clean result means something)', () => {
    for (const page of OVERLAY_PAGES) expect(reachable.has(page), page).toBe(true);
    expect(reachable.has('admin/map-fit.js')).toBe(true); // reached through a page, not the code
  });

  it('lists no file the game can reach', () => {
    const wrong = [...reachable].filter((f) => isListed(f));
    expect(wrong).toEqual([]);
  });

  it('every overlay page the game loads is kept', () => {
    for (const page of OVERLAY_PAGES) expect(isListed(page), page).toBe(false);
  });

  it('leaves no admin page unclassified: reached from the game, or listed', () => {
    const pages = [...walk(path.join(publicDir, 'admin'))]
      .filter((f) => f.endsWith('.html'))
      .map((f) => path.relative(publicDir, f).split(path.sep).join('/'));
    const unclassified = pages.filter((p) => !reachable.has(p) && !isListed(p));
    expect(unclassified, 'a new page: reach it from the game or add it to DEV_ONLY').toEqual([]);
  });

  it('has no stale entry: every listed path exists in public/', () => {
    const missing = DEV_ONLY.filter((e) => !fs.existsSync(path.join(publicDir, e)));
    expect(missing).toEqual([]);
  });

  it('keeps the voice booth list inside it', () => {
    for (const f of BOOTH_FILES) expect(DEV_ONLY).toContain(f);
  });

  it('never names the folder of overlays or the scene art', () => {
    for (const e of DEV_ONLY) {
      expect(e).not.toBe('admin/');
      expect(e.startsWith('admin/scene-assets/') && e.endsWith('/')).toBe(false);
    }
  });

  it('keeps web-only files out of DEV_ONLY, and the two lists apart', () => {
    for (const e of WEB_ONLY) expect(DEV_ONLY).not.toContain(e);
    expect(WEB_ONLY).toContain('404.html');
    expect(WEB_ONLY).toContain('.htaccess');
  });
});

describe('assets/reference/ and assets/samples/ (140A follow-up)', () => {
  const folders = ['assets/reference/', 'assets/samples/'];

  /** The list of art the game loads at run time: what the asset manifest plugin emits for public/assets. */
  function manifestFor(pubDir: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugin = assetManifestPlugin() as any;
    plugin.configResolved({ publicDir: pubDir });
    let source = '[]';
    plugin.generateBundle.call({ emitFile: (f: { source: string }) => (source = f.source) });
    return JSON.parse(source);
  }

  it('hold files, so the checks below are about something', () => {
    for (const f of folders) {
      expect([...walk(path.join(publicDir, f))].length, f).toBeGreaterThan(0);
    }
  });

  it('are not named by any code, page, script or stylesheet the game reaches', () => {
    const reached = [...reachable].filter((f) => folders.some((d) => f.startsWith(d)));
    expect(reached).toEqual([]);
  });

  it('are not in the manifest AssetLoader loads from (the game never asks for them)', () => {
    const manifest = manifestFor(publicDir);
    expect(manifest.length).toBeGreaterThan(500); // the real list, so an empty one cannot pass
    expect(manifest.filter((f) => folders.some((d) => f.startsWith(d)))).toEqual([]);
  });

  it('are not loaded by name anywhere in the game source or the pages it loads', () => {
    // An exact path, not "assets/reference" (which also matches admin/scene-assets/reference/,
    // a different folder that the game does use).
    const exact = /(^|[^-\w])assets\/(?:reference|samples)\//;
    const offenders: string[] = [];
    const scan = (file: string) => {
      const text = stripLine(stripBlock(fs.readFileSync(file, 'utf8')));
      if (exact.test(text)) offenders.push(path.relative(gameDir, file));
    };
    for (const f of walk(path.join(gameDir, 'src'))) {
      if (f.endsWith('.ts') && !f.includes(`${path.sep}__tests__${path.sep}`) && !f.endsWith('.test.ts')) scan(f);
    }
    for (const f of reachable) {
      if (/\.(html|js|css|json)$/.test(f)) scan(path.join(publicDir, f));
    }
    expect(offenders).toEqual([]);
  });

  it('assets/samples/ is on the prune list, so it stays out of the web build and the iOS build', () => {
    expect(DEV_ONLY).toContain('assets/samples/');
    expect(isListed('assets/samples/bg-corridor.png')).toBe(true);
  });
});

describe('the audit itself (it can fail)', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-audit-')));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function fixture(files: Record<string, string>) {
    const root = path.join(tmp, `f${Math.random().toString(36).slice(2, 8)}`);
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    }
    return { src: path.join(root, 'src'), pub: path.join(root, 'public'), index: path.join(root, 'index.html') };
  }

  it('flags a dev page the code names', () => {
    const f = fixture({
      'index.html': '<html></html>',
      'src/main.ts': "const u = '/admin/cockpit.html?embed=1';",
      'public/admin/cockpit.html': '<html></html>',
    });
    expect(reachableFiles(f.src, f.pub, f.index).has('admin/cockpit.html')).toBe(true);
  });

  it('flags a dev page that a page the game loads links to', () => {
    const f = fixture({
      'index.html': '<html></html>',
      'src/main.ts': "const u = '/admin/menu.html';",
      'public/admin/menu.html': '<a href="/admin/cockpit.html">cockpit</a>',
      'public/admin/cockpit.html': '<html></html>',
    });
    expect(reachableFiles(f.src, f.pub, f.index).has('admin/cockpit.html')).toBe(true);
  });

  it('follows a script a page loads, and a folder a script names', () => {
    const f = fixture({
      'index.html': '<html></html>',
      'src/main.ts': "const u = '/admin/menu.html';",
      'public/admin/menu.html': '<script src="tool.js"></script>',
      'public/admin/tool.js': "fetch('/admin/spike/data.json')",
      'public/admin/spike/data.json': '{}',
    });
    const got = reachableFiles(f.src, f.pub, f.index);
    expect(got.has('admin/tool.js')).toBe(true);
    expect(got.has('admin/spike/data.json')).toBe(true);
  });

  it('does not count a name that only appears in a comment', () => {
    const f = fixture({
      'index.html': '<html></html>',
      'src/main.ts': "// see /admin/cockpit.html\n/* and /admin/anchors.html */\nconst u = '/admin/menu.html';",
      'public/admin/menu.html': '<!-- /admin/cockpit.html --><style>/* /admin/anchors.html */</style>',
      'public/admin/cockpit.html': '<html></html>',
      'public/admin/anchors.html': '<html></html>',
    });
    const got = reachableFiles(f.src, f.pub, f.index);
    expect(got.has('admin/cockpit.html')).toBe(false);
    expect(got.has('admin/anchors.html')).toBe(false);
  });
});

// ---- the plugin, in a real build ----------------------------------------------

describe('the plugin in a production build', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-prunebuild-')));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function project(): string {
    const root = path.join(tmp, `p${Math.random().toString(36).slice(2, 8)}`);
    const put = (rel: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    };
    put('index.html', '<!doctype html><title>t</title><script type="module" src="/main.js"></script>');
    put('main.js', 'console.log("hi");');
    put('public/404.html', '<!doctype html>lost');
    put('public/admin/menu.html', '<!doctype html>menu');
    put('public/admin/map-fit.js', '//');
    put('public/admin/scene-assets/cast/warden-marnie.png', 'png');
    put('public/admin/cockpit.html', '<!doctype html>cockpit');
    put('public/admin/cast-gallery.html', '<!doctype html>gallery');
    put('public/admin/drive-spike/lights.js', '//');
    put('public/admin/drive-spike.html', '<!doctype html>spike');
    put('public/mockups/menus.html', '<!doctype html>mock');
    return root;
  }

  async function buildInto(root: string, outDir: string, plugins = [pruneDevOnlyPlugin()]): Promise<string> {
    await build({ root, configFile: false, logLevel: 'silent', plugins, build: { outDir, emptyOutDir: true } });
    return path.resolve(root, outDir);
  }

  it('removes the listed files and folders, and keeps the overlays, the scene art and 404.html', async () => {
    const root = project();
    const out = await buildInto(root, 'dist');
    for (const gone of ['admin/cockpit.html', 'admin/cast-gallery.html', 'admin/drive-spike.html', 'admin/drive-spike', 'mockups']) {
      expect(fs.existsSync(path.join(out, gone)), gone).toBe(false);
    }
    for (const kept of ['admin/menu.html', 'admin/map-fit.js', 'admin/scene-assets/cast/warden-marnie.png', '404.html', 'index.html']) {
      expect(fs.existsSync(path.join(out, kept)), kept).toBe(true);
    }
  }, 60_000);

  it('does the same whichever folder --outDir names (the iOS build)', async () => {
    const root = project();
    const out = await buildInto(root, 'dist-ios');
    expect(fs.existsSync(path.join(out, 'admin/cockpit.html'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'admin/menu.html'))).toBe(true);
  }, 60_000);

  it('leaves public/ alone, so a dev server still serves the tools', async () => {
    const root = project();
    await buildInto(root, 'dist');
    expect(fs.existsSync(path.join(root, 'public/admin/cockpit.html'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/mockups/menus.html'))).toBe(true);
  }, 60_000);

  it('would have shipped them without the plugin (the check can fail)', async () => {
    const root = project();
    const out = await buildInto(root, 'dist', []);
    expect(fs.existsSync(path.join(out, 'admin/cockpit.html'))).toBe(true);
  }, 60_000);
});

describe('the iOS build reads the same list', () => {
  const ios = fs.readFileSync(fileURLToPath(new URL('../../../../scripts/build-ios.mjs', import.meta.url)), 'utf8');

  it('imports it, and keeps no list of its own', () => {
    expect(ios).toContain("apps/game/plugins/prune-list.mjs");
    expect(ios).not.toContain("'mockups/'");
    expect(ios).not.toContain("'404.html'");
  });

  it('turns every entry into an rsync pattern anchored at the root of dist', () => {
    const patterns = rsyncExcludes([...DEV_ONLY, ...WEB_ONLY]);
    expect(patterns.length).toBe(DEV_ONLY.length + WEB_ONLY.length);
    for (const p of patterns) expect(p.startsWith('/')).toBe(true);
    expect(patterns).toContain('/admin/cockpit.html');
    expect(patterns).toContain('/mockups/');
    expect(patterns).toContain('/workbox-*.js');
  });
});
