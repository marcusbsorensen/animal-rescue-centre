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
        globIgnores: ['**/*-preview/**', '**/_backup*/**', '**/reference/**', '**/samples/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
});
