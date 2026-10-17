/**
 * Vite plugin: the voice booth, in development only.
 *
 * The booth (public/admin/voice-booth.html) is where Marcus and friends record
 * the adoption hand-over lines. It needs somewhere to put what it records, and
 * this is it: a dev-server middleware that saves takes into apps/game/voice-
 * takes/ (gitignored). Same shape as dev-review-assets.ts: `configureServer`
 * only, so nothing is mounted in `vite build` or `vite preview`.
 *
 * The page and its script (public/admin/voice-script.json) sit in public/ so
 * a dev server serves them with no configuration at all, and that is also the
 * trap: a build copies public/ wholesale, and the booth would ship to children.
 * So after a build writes its bundle, this removes them from the output
 * directory, wherever --outDir put it (dist, dist-ios). The check is in
 * plugins/__tests__/voice-booth-build.test.ts, which runs a real build.
 *
 * Adding this to vite.config.ts restarts a running dev server (Vite restarts on
 * any change to the config or a file the config imports), which is why it
 * lands separately from the rest of the voice work.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { createVoiceBoothHandler } from './voice-booth-handler';

/** Files under public/ that exist for the booth, as paths inside a build's output. */
export const BOOTH_FILES = ['admin/voice-booth.html', 'admin/voice-script.json'];

export default function voiceBoothPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'arc-voice-booth',

    configResolved(resolved) {
      config = resolved;
    },

    // Dev server only. Nothing here runs for `vite build` or `vite preview`.
    configureServer(server) {
      const dir = path.resolve(server.config.root, 'voice-takes');
      server.middlewares.use(createVoiceBoothHandler({ dir }));
      server.config.logger.info(`  voice booth: http://localhost:${server.config.server.port ?? 5173}/admin/voice-booth.html  (takes go to ${path.relative(process.cwd(), dir) || dir})`);
    },

    // Build only: take the booth back out of what was just written.
    closeBundle() {
      if (!config || config.command !== 'build') return;
      const out = path.resolve(config.root, config.build.outDir);
      for (const rel of BOOTH_FILES) {
        const file = path.join(out, rel);
        if (fs.existsSync(file)) fs.rmSync(file);
      }
    },
  };
}
