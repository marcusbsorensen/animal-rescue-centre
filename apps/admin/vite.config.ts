import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * This app is LOCAL ONLY. It must never be built for deployment.
 *
 * It talks to Supabase with the service-role key, which bypasses row-level
 * security entirely, and it gates itself behind a password compared in the
 * browser. Both arrive through `import.meta.env`, and Vite inlines anything
 * prefixed `VITE_` straight into the JavaScript bundle — so a production
 * build of this app publishes a key that can read and overwrite every
 * child's saved game, plus the password meant to protect it.
 *
 * Nothing deploys it today: vercel.json builds only `@arc/game`. But that
 * is a convention, and conventions are one `vercel deploy` away from being
 * broken by accident. So the build refuses to run instead.
 *
 * If you genuinely need a bundle for local use (previewing the production
 * build, say), acknowledge it explicitly:
 *
 *   ARC_ADMIN_LOCAL_BUILD=1 pnpm --filter @arc/admin build
 *
 * The real fix, when the admin app matters enough to warrant it, is to move
 * its reads behind an Edge Function that holds the service role server-side
 * and to authenticate properly — at which point this guard can go.
 */
function localOnlyGuard() {
  return {
    name: 'arc-admin-local-only',
    apply: 'build' as const,
    config() {
      if (process.env.ARC_ADMIN_LOCAL_BUILD === '1') return;
      throw new Error(
        '\n\n' +
        '  @arc/admin is local-only and must not be built for deployment.\n\n' +
        '  It embeds VITE_SUPABASE_SERVICE_ROLE_KEY (bypasses RLS on every\n' +
        '  table, including children\'s saved games) and VITE_ADMIN_PASSWORD\n' +
        '  into the bundle. Publishing that bundle publishes both.\n\n' +
        '  For local use only:  ARC_ADMIN_LOCAL_BUILD=1 pnpm --filter @arc/admin build\n' +
        '  For development:     pnpm --filter @arc/admin dev\n',
      );
    },
  };
}

export default defineConfig({
  plugins: [localOnlyGuard(), react()],
  server: { port: 5174 },
});
