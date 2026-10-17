/**
 * What a production build leaves out. ONE list, read by both builds:
 *
 *   - the web build, through plugins/prune-dev-only.ts (a Vite plugin that
 *     removes DEV_ONLY from the output after the bundle is written, wherever
 *     --outDir puts it), and
 *   - the iOS build, through scripts/build-ios.mjs (DEV_ONLY and WEB_ONLY go
 *     into the rsync that stages dist-ios).
 *
 * Paths are relative to a build's output folder, which is public/ copied whole
 * plus Vite's own files. A trailing slash means a folder. No globs, except in
 * WEB_ONLY, which only rsync reads.
 *
 * DEV_ONLY: tools, mock-ups and review galleries. Children must never be able
 * to reach them, and a native app has no use for them either (App Store 2.3.1,
 * "hidden features"). Marcus, 140A.
 * WEB_ONLY: files that belong to a web host and mean nothing inside the iOS shell.
 *
 * `public/admin/` is a misleading name: it holds the game's own HTML overlays
 * (AuthOverlay's welcome, login, signup, menu ...; InGameOverlay's tunnel, map,
 * drive ...) next to the dev tools. THE OVERLAYS MUST STAY. Never exclude the
 * folder, and never exclude `admin/scene-assets/`: the game builds many of those
 * art names at run time (cast portraits, tunnel soil tiles), so no static search
 * can say which of them are unused.
 *
 * Adding a page to public/admin/ means choosing here. plugins/__tests__/
 * prune-list.test.ts fails for a page that is neither reached from the game's
 * code nor listed below, and for a listed file the game reaches.
 */

export const DEV_ONLY = [
  'mockups/',                       // design references, referenced by nothing

  // assets/samples/: ten early style samples (two 1280-wide backgrounds, sprites, a
  // button), 2.5 MB. Not copies of the real art: the game's bg-kitchen.png and the
  // rest live in assets/bg/, assets/food/ and so on. Nothing loads them. The asset
  // manifest skips the folder by name, so AssetLoader never asks for it, and no page,
  // script, tool or doc names it.
  'assets/samples/',
  //
  // assets/reference/ is NOT listed, on purpose. It is 50 character reference
  // sheets (illustrations, not photographs; 2.3 MB) that the game never loads
  // (also skipped by the asset manifest). But the Manus route in
  // docs/sprite-brief-2026-08-29.md links them by public URL
  // (/assets/reference/<file>-reference.png) as the character lock for a variant,
  // and a brief that cites a file the site does not serve "silently gets no
  // reference at all". To prune them, move that route's references somewhere
  // else first, then add 'assets/reference/' here; the test already proves the
  // game cannot reach the folder.

  // Art review galleries and sprite sheets.
  'admin/animal-scale-review.html',
  'admin/arc-tier1-review.html',
  'admin/asset-review-2026-05-03.html',
  'admin/assets-preview.html',
  'admin/cast-gallery.html',
  'admin/cast-walking-gallery.html',
  'admin/manus-review.html',
  'admin/sprite-grid-v3.html',
  'admin/sprite-grid.html',
  'admin/stock-review.html',
  'admin/wardrobe-review.html',
  'admin/scene-assets/reference/arc-site-tier1-2026-04-29/seamless/tile-test.html',

  // Editors and tuning tools.
  'admin/anchors.html',
  'admin/anchors.js',
  'admin/collar-anchors.html',
  'admin/cockpit-editor.html',

  // Design mock-ups and prototypes. The game's own versions are Phaser scenes or
  // the overlays that stay (map.html, drive-overlay.html, tunnel.html ...).
  'admin/birchie-map.html',
  'admin/cockpit.html',
  'admin/level-progression.html',
  'admin/map-options.html',
  'admin/map-v2-mockup.html',
  'admin/news.html',
  'admin/play-dog.html',
  'admin/pre-drive.html',
  'admin/tube-man.html',
  'admin/tube-man.js',
  'admin/vehicle-orientation.html',
  'admin/drive-spike.html',
  'admin/drive-spike/',             // its modules and node checks; the game's driving is src/driving/

  // The voice booth. plugins/voice-booth.ts also removes these two, and its
  // BOOTH_FILES must stay inside this list (the test checks).
  'admin/voice-booth.html',
  'admin/voice-script.json',
];

export const WEB_ONLY = [
  '404.html',                       // a native app has no 404 route
  '.htaccess',                      // the web host's Apache rules (apps/game/public/.htaccess)
  'sw.js',                          // service workers do not run on capacitor://
  'workbox-*.js',
  'registerSW.js',
  'sw-cache-cleanup.js',            // imported by sw.js (plugins/cache-names.ts)
];

/** rsync --exclude patterns, anchored at the root of the transfer. */
export function rsyncExcludes(entries) {
  return entries.map((e) => `/${e}`);
}
