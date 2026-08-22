/**
 * Vite plugin: serve the art-review folders in dev only.
 *
 * The raw render dumps behind the review galleries — 792 MB of them — used
 * to sit in `public/admin/`, which meant every clone, every CI run and
 * every deploy carried them, and the service worker tried to precache
 * them. They now live in the untracked `asset-drafts/admin-review/`
 * sibling, following the pattern already set for the vehicle-restyle art.
 *
 * That would leave the review galleries (sprite-grid-v3.html, play-dog,
 * cast-gallery, cast-walking-gallery) pointing at nothing. So in dev — and
 * only in dev, via configureServer — we map their original URLs onto the
 * new location. Nothing is emitted at build time, so production stays
 * lean and the galleries keep working locally.
 *
 * Missing files fall through to Vite's normal 404 rather than erroring:
 * asset-drafts/ is untracked, so a fresh clone legitimately won't have it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** URL prefix under /admin/ → folder name under asset-drafts/admin-review/. */
const ROUTES: Record<string, string> = {
  '/admin/regen-v3-sprites/': 'regen-v3-sprites',
  '/admin/vehicle-restyle/': 'vehicle-restyle',
  '/admin/scene-assets/cast/original/': 'cast-original',
  '/admin/scene-assets/cast/apprentices-walking/': 'cast-apprentices-walking',
  '/admin/scene-assets/cast/variants/original/': 'cast-variants-original',
  '/admin/scene-assets/cast/apprentices/original/': 'cast-apprentices-original',
};

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

export default function devReviewAssetsPlugin(): Plugin {
  return {
    name: 'arc-dev-review-assets',
    apply: 'serve',

    configureServer(server) {
      const root = path.resolve(server.config.root, '../../asset-drafts/admin-review');

      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        const prefix = Object.keys(ROUTES).find((p) => url.startsWith(p));
        if (!prefix) return next();

        const rest = url.slice(prefix.length);
        // Refuse anything that tries to climb out of the review folder.
        if (rest.includes('..')) return next();

        const file = path.join(root, ROUTES[prefix], rest);
        if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }

        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}
