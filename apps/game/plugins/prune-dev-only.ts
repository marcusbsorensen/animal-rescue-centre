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
 *
 * It also sweeps .DS_Store out of the output. Finder writes one into any folder
 * it is used to look at, including public/, and `vite build` copies them along
 * with everything else. The deploy excludes .DS_Store from the rsync, so one in
 * dist never reached the host, but it made the file count the deploy reports
 * differ from the files in dist, which is what tools/test-deploy-arcgame.sh
 * compares.
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
      const finderFiles = sweepDsStore(out);
      config.logger.info(`  pruned ${removed} dev-only entr${removed === 1 ? 'y' : 'ies'} from ${path.relative(process.cwd(), out) || out}`);
      if (finderFiles > 0) {
        config.logger.info(`  swept ${finderFiles} .DS_Store file${finderFiles === 1 ? '' : 's'} out of the build`);
      }
    },
  };
}

/** Delete every .DS_Store under `dir`, and say how many there were. */
function sweepDsStore(dir: string): number {
  let swept = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      swept += sweepDsStore(full);
    } else if (entry.name === '.DS_Store') {
      fs.rmSync(full, { force: true });
      swept += 1;
    }
  }
  return swept;
}
