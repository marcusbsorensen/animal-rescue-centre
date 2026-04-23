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
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
        globIgnores: ['**/*-preview/**', '**/*-preview-v2/**', '**/regen-v3-sprites/**', '**/_backup*/**', '**/reference/**', '**/samples/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
