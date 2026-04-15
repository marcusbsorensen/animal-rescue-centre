/**
 * Vite plugin: scans public/assets/ at build time (and on dev server start)
 * and emits a JSON manifest of every file that actually exists.
 *
 * This means BootScene only tries to load real files — zero 404s.
 */
import { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

function scanAssets(publicDir: string): string[] {
  const assetsDir = path.join(publicDir, 'assets');
  if (!fs.existsSync(assetsDir)) return [];

  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // skip reference/samples/preview/backup directories — not used at runtime
        if (entry.name === 'reference' || entry.name === 'samples') continue;
        if (entry.name.endsWith('-preview') || entry.name.startsWith('_backup')) continue;
        walk(full);
      } else {
        // Skip underscore-prefixed files (backups, references, previews)
        if (entry.name.startsWith('_')) continue;
        // Store path relative to public dir (e.g. "assets/animals/cat-arriving.png")
        results.push(path.relative(publicDir, full));
      }
    }
  }

  walk(assetsDir);
  return results.sort();
}

export default function assetManifestPlugin(): Plugin {
  let publicDir: string;

  return {
    name: 'arc-asset-manifest',

    configResolved(config) {
      publicDir = config.publicDir;
    },

    // Dev: serve the manifest from a virtual module
    configureServer(server) {
      server.middlewares.use('/asset-manifest.json', (_req, res) => {
        const files = scanAssets(publicDir);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(files));
      });
    },

    // Build: emit as a static asset
    generateBundle() {
      const files = scanAssets(publicDir);
      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: JSON.stringify(files),
      });
    },
  };
}
