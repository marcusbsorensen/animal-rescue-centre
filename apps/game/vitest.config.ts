import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // e2e/ and e2e-compat/ hold Playwright specs; vitest has no business
    // running them. Without this exclude, vitest picks up their *.spec.ts and
    // crashes ("test() not expected here") because Playwright uses its own
    // runner. e2e-compat/ arrived with the old-client-compat branch and was
    // missed here, so `pnpm test` has been failing on it ever since.
    exclude: ['node_modules', 'dist', 'e2e', 'e2e-compat'],
  },
});
