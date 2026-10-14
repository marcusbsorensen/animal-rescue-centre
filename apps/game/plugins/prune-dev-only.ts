/**
 * Vite plugin: take the dev-only pages out of a production build.
 *
 * `vite build` copies public/ into the output whole, which is how the cockpit
 * mock-up, the art review galleries and the editors ended up on the web host.
 * This removes the files listed in plugins/prune-list.mjs (DEV_ONLY) once the
 * bundle is written, wherever --outDir put it (dist, dist-ios). Same shape as
 * plugins/voice-booth.ts, which does it for the booth alone.
 *
 * Build only: a dev server still serves everything in public/, and public/ is
 * never touched, so the tools keep working locally.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { DEV_ONLY } from './prune-list.mjs';

export default function pruneDevOnlyPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'arc-prune-dev-only',

    configResolved(resolved) {
      config = resolved;
    },

    closeBundle() {
      if (!config || config.command !== 'build') return;
      const out = path.resolve(config.root, config.build.outDir);
      let removed = 0;
      for (const rel of DEV_ONLY) {
        const target = path.join(out, rel);
        // Never follow an entry out of the output folder.
        if (!target.startsWith(out + path.sep)) continue;
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
          removed += 1;
        }
      }
      config.logger.info(`  pruned ${removed} dev-only entr${removed === 1 ? 'y' : 'ies'} from ${path.relative(process.cwd(), out) || out}`);
    },
  };
}
