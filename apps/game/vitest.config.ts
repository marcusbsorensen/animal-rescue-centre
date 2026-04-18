import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // e2e/ holds Playwright specs; vitest has no business running them.
    // Without this exclude, vitest picks up e2e/*.spec.ts and crashes
    // ("test() not expected here") because Playwright uses its own runner.
    exclude: ['node_modules', 'dist', 'e2e'],
  },
});
