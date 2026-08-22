import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import assetManifestPlugin from './plugins/asset-manifest';

export default defineConfig({
  plugins: [
    assetManifestPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'A.R.C. — Animal Rescue Centre',
        short_name: 'A.R.C.',
        description: 'Run your own animal rescue centre!',
        theme_color: '#4a9c5d',
        background_color: '#fef9ef',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // PRECACHE = app shell only.
        //
        // Globbing the art folders too built a 1124-entry / 454 MB precache
        // manifest. A service worker installs all-or-nothing, so on iOS —
        // where the per-origin quota is a small fraction of that — install
        // failed, the worker never activated, offline never worked, and the
        // whole download was retried on every visit.
        //
        // The art is already tiered by AssetLoader (boot → essential →
        // variant), so precaching it duplicated that work and fought it.
        // Now the shell precaches (~2 MB) and art lands in the runtime
        // caches below as the game actually asks for it — which means
        // anything the player has already seen still works offline.
        globPatterns: ['**/*.{js,css,html,woff2}', 'icons/*.png', 'favicon.svg'],
        globIgnores: ['admin/**', 'mockups/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // Game art — immutable once shipped, so cache-first.
            urlPattern: /\/assets\/.*\.(?:png|jpg|jpeg|webp|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'arc-art',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/.*\.(?:mp3|ogg|wav|webm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'arc-audio',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Overlay pages and the cast/map art they pull in. Revalidating
            // keeps an edited overlay fresh without blocking the open.
            urlPattern: /\/admin\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'arc-overlays',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Manifest + anchor data — small, and changes with each deploy.
            urlPattern: /\/(?:asset-manifest\.json|data\/.*\.json)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'arc-data',
              expiration: { maxEntries: 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Don't let the SPA app-shell fallback hijack admin tools, JSON data
        // files, or the 404 page — we want the real file (or Vercel's 404) to
        // win for these routes instead of returning index.html from cache.
        navigateFallbackDenylist: [
          /^\/admin\//,
          /^\/data\//,
          /^\/404\.html$/,
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // Split Phaser (big, rarely changes) into its own chunk so the app shell
    // stays small and the engine caches independently across deploys.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
