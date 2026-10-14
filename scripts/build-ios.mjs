#!/usr/bin/env node
/**
 * Build the web bundle, then stage a pruned copy for the iOS shell.
 *
 * Capacitor copies `webDir` wholesale, so `dist-ios` is a filtered copy
 * of `dist` and the native `webDir` points at it. Run `pnpm build:ios`
 * rather than `cap sync` directly, or the shell ships whatever
 * `dist-ios` last held.
 *
 * DO NOT exclude `admin/`. The name is misleading: `public/admin/` is
 * the game's own HTML UI layer, not internal tooling. AuthOverlay loads
 * welcome/login/signup/menu/friends from it, InGameOverlay loads ~12
 * more (vet, adoption, map, drive, badge …), and BootScene pulls the
 * apprentice cast art straight out of `admin/scene-assets/`. Dropping
 * the folder froze the boot splash with nine loader 404s and no menu.
 *
 * There ARE real dev-only pages in there — cockpit.html, cast-gallery,
 * the asset-review pages — and they are left out of EVERY build, this one
 * and the web one, by the list in apps/game/plugins/prune-list.mjs
 * (DEV_ONLY). That file is the one place to change it. It holds the
 * reference audit's result, and plugins/__tests__/prune-list.test.ts keeps
 * it honest.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEV_ONLY, WEB_ONLY, rsyncExcludes } from '../apps/game/plugins/prune-list.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(root, 'apps', 'game');
const dist = path.join(game, 'dist');
const staged = path.join(game, 'dist-ios');

/**
 * DEV_ONLY is already out of dist (the build removes it), and is listed here
 * too, so a dist built some other way is still pruned. WEB_ONLY belongs to a
 * web host and stays in the web build.
 */
const EXCLUDE = rsyncExcludes([...DEV_ONLY, ...WEB_ONLY]);

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });

const dirSize = (p) =>
  execFileSync('du', ['-sk', p]).toString().split('\t')[0] * 1024;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log('→ vite build');
run('pnpm', ['--filter', '@arc/game', 'build'], root);

if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  console.error(`✗ ${dist} missing after build — aborting.`);
  process.exit(1);
}

console.log('→ staging dist-ios (pruned)');
rmSync(staged, { recursive: true, force: true });
mkdirSync(staged, { recursive: true });
run('rsync', [
  '-a',
  '--delete',
  ...EXCLUDE.flatMap((p) => ['--exclude', p]),
  `${dist}/`,
  `${staged}/`,
]);

// Report the file count, not just du -sk. The two trees can differ by
// tens of MB on APFS purely from block accounting, which reads as a big
// prune when almost nothing was actually removed.
const count = (p) =>
  Number(execFileSync('bash', ['-c', `find "${p}" -type f | wc -l`]).toString().trim());

console.log(
  `  ${count(dist)} files (${mb(dirSize(dist))}) → ` +
    `${count(staged)} files (${mb(dirSize(staged))})`,
);

console.log('→ cap sync ios');
run('pnpm', ['exec', 'cap', 'sync', 'ios'], game);

console.log('✓ iOS bundle staged and synced.');
