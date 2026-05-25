/**
 * v6.25 P7 — workspace-wide vitest config. Picks up __tests__/* in all
 * packages. Aliases @furball/shared so server/client tests import via
 * the same path as runtime code.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['packages/**/__tests__/**/*.test.ts'],
    // node env keeps the bar low — no jsdom required for the initial
    // skeleton. Tests that need DOM can opt into 'jsdom' per-file.
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@furball/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
