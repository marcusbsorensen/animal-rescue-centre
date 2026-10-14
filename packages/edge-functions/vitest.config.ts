import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Runs the real Edge Function files from `supabase/functions/` under Node.
 *
 * Two things stand between those files and Vitest, and both are replaced
 * here rather than in the functions themselves:
 *
 * - They import supabase-js from esm.sh. The alias points that address at
 *   a fake client (`src/support/fake-supabase-js.ts`) that answers from a
 *   script the test sets up, and records every query. Nothing reaches a
 *   network or a database.
 * - They call `Deno.serve` and `Deno.env`. `src/support/deno.ts` puts a
 *   stand-in `Deno` on `globalThis` that captures the handler and reads an
 *   env the test controls.
 *
 * Kept outside `supabase/` on purpose: a package.json beside the function
 * code could change how the Supabase CLI bundles it.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'https://esm.sh/@supabase/supabase-js@2',
        replacement: fileURLToPath(new URL('./src/support/fake-supabase-js.ts', import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
