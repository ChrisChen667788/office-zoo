/**
 * v6.162 — 存储层两处既有缺陷的回归:
 *
 *  1. 测试改写开发者本机真实数据:此前测试直接读写 packages/server/data/(grudgeVote 每跑一次
 *     删一次 relations.json)。现在 vitest 把 FURBALL_DATA_DIR 指到一次性临时目录。
 *  2. 并发写撞同一个 .tmp:一局 8 人同时投票,characterStatsStore 每票写一次,共用
 *     `character_stats.json.tmp` → 后一次 rename ENOENT(这也是 CI 偶发
 *     「Closing rpc while onUserConsoleLog was pending」的来源)。
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { DATA_DIR } from '../dataDir';
import { writeJsonAtomic } from '../atomicJson';

const REPO_DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data');

describe('DATA_DIR under vitest', () => {
  it('指向临时目录,不是仓库里的 packages/server/data', () => {
    expect(path.resolve(DATA_DIR)).not.toBe(REPO_DATA);
    expect(DATA_DIR.startsWith(tmpdir())).toBe(true);
  });
});

describe('writeJsonAtomic', () => {
  it('同一文件 50 路并发写:不报错、最终是最后一次的内容、不留 .tmp', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'atomic-json-'));
    const file = path.join(dir, 'store.json');
    try {
      await Promise.all(Array.from({ length: 50 }, (_, i) => writeJsonAtomic(file, { n: i })));
      expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ n: 49 });
      expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('内容在调用时快照:调用后再改对象不影响这次写入', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'atomic-json-'));
    const file = path.join(dir, 'store.json');
    try {
      const state = { v: 1 };
      const p = writeJsonAtomic(file, state);
      state.v = 2;
      await p;
      expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ v: 1 });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('一次写失败不卡住后续写入,失败的临时文件被清掉', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'atomic-json-'));
    const blocked = path.join(dir, 'is-a-dir.json');
    await fs.mkdir(blocked); // rename 文件到一个已存在的目录上会失败
    const file = path.join(dir, 'ok.json');
    try {
      await expect(writeJsonAtomic(blocked, { x: 1 })).rejects.toBeTruthy();
      await writeJsonAtomic(blocked.replace('is-a-dir', 'after'), { y: 2 });
      await writeJsonAtomic(file, { z: 3 });
      expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ z: 3 });
      expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
