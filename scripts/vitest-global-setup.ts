/**
 * v6.162 — vitest 全局收尾:删掉 vitest.config.ts 为本次运行建的临时数据目录。
 */
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

export default function setup() {
  return () => {
    const dir = process.env.FURBALL_TEST_DATA_DIR;
    // 只删自己建的那个临时目录,防误删。
    if (dir && dir.startsWith(tmpdir()) && dir.includes('furball-test-data-')) {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
