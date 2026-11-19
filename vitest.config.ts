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

// v6.165 — 测试进程里所有密钥类变量一律置空。dotenv 不覆盖已存在(哪怕是空串)的变量,
// 所以即使某个模块又偷偷加载了 .env,真实 key 也进不来。新增密钥变量时记得补到这里
// (scripts/__tests__/testEnvSecrets.test.ts 会对照 .env.example 检查)。
// v6.167 — 记忆库(pgvector)指向一个必定连不上的地址:测试里跑对局会写记忆,不隔离就写进开发者
// 本机 docker 里的真实记忆库(一次测量就写进了 27 条假记忆)。连接被立即拒绝,记忆读写按现有逻辑降级。
export const TEST_PGVECTOR_URL = 'postgresql://test:test@127.0.0.1:1/none';

export const BLANK_SECRETS: Record<string, string> = Object.fromEntries([
  'OPENAI_API_KEY', 'QINGYUN_API_KEY', 'MINIMAX_API_KEY', 'MINIMAX_VIDEO_API_KEY', 'MINIMAX_GROUP_ID',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'MAKER_TOKEN', 'MEMORY_ADMIN_TOKEN',
  'MODELSCOPE_API_TOKEN',
].map((k) => [k, '']));

export default defineConfig({
  test: {
    // v6.47 P1 — also pick up scripts/__tests__ so the capture-script
    // mode-match logic (extracted to scripts/lib) gets real coverage.
    include: ['packages/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts'],
    // node env keeps the bar low — no jsdom required for the initial
    // skeleton. Tests that need DOM can opt into 'jsdom' per-file.
    environment: 'node',
    globals: false,
    env: { FURBALL_DATA_DIR: testDataDir, PGVECTOR_URL: TEST_PGVECTOR_URL, ...BLANK_SECRETS },
    globalSetup: ['./scripts/vitest-global-setup.ts'],
    // v6.165 — 拦住测试里的一切对外网络请求(见 scripts/vitest-setup.ts)。
    setupFiles: ['./scripts/vitest-setup.ts'],
  },
  resolve: {
    alias: {
      '@furball/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
