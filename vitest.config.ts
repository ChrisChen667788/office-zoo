/**
 * v6.25 P7 — workspace-wide vitest config. Picks up __tests__/* in all
 * packages. Aliases @furball/shared so server/client tests import via
 * the same path as runtime code.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// v6.162 — 测试的服务端数据写进一次性临时目录,不再改写/删除开发者本机 packages/server/data/
// 里的真实数据(此前 grudgeVote 测试每跑一次就删一次 relations.json)。globalSetup 负责收尾删除。
const testDataDir = mkdtempSync(path.join(tmpdir(), 'furball-test-data-'));
process.env.FURBALL_TEST_DATA_DIR = testDataDir;

export default defineConfig({
  test: {
    // v6.47 P1 — also pick up scripts/__tests__ so the capture-script
    // mode-match logic (extracted to scripts/lib) gets real coverage.
    include: ['packages/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts'],
    // node env keeps the bar low — no jsdom required for the initial
    // skeleton. Tests that need DOM can opt into 'jsdom' per-file.
    environment: 'node',
    globals: false,
    env: { FURBALL_DATA_DIR: testDataDir },
    globalSetup: ['./scripts/vitest-global-setup.ts'],
  },
  resolve: {
    alias: {
      '@furball/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
