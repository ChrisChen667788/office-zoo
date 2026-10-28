/**
 * v6.168 验收 — 并发写回放不丢失。
 *
 * 多局同时结束时 saveReplay 会并发调用:每次都先改同一份内存缓存,再把整份快照交给
 * writeJsonAtomic 按文件串行落盘,所以最后落盘的那份包含全部对局。这里用独立的临时数据目录
 * (同一次 vitest 运行里其它测试文件共用 FURBALL_DATA_DIR,会互相覆盖 replays.json),
 * 落盘后清掉缓存、从磁盘重新读一遍来断言。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ReplayRecord } from '@furball/shared';

const savedDir = process.env.FURBALL_DATA_DIR;
let dir = '';

afterEach(async () => {
  process.env.FURBALL_DATA_DIR = savedDir;
  vi.resetModules();
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

const rec = (gameId: string, endedAt: number): ReplayRecord => ({
  gameId, endedAt, winner: 'workers' as ReplayRecord['winner'], rounds: 1, players: [], timeline: [],
});

describe('replayStore 并发写', () => {
  it('30 局同时保存:磁盘上 30 局都在、顺序与调用顺序一致、不留临时文件', async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), 'replay-concurrency-'));
    process.env.FURBALL_DATA_DIR = dir;
    vi.resetModules();
    const store = await import('../replayStore');

    const ids = Array.from({ length: 30 }, (_, i) => `game_c${i}`);
    await Promise.all(ids.map((id, i) => store.saveReplay(rec(id, 1000 + i))));

    store.__resetReplayCacheForTests();
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, 'replays.json'), 'utf8')) as { order: string[]; byId: Record<string, unknown> };
    expect(onDisk.order).toEqual(ids);
    expect(Object.keys(onDisk.byId).sort()).toEqual([...ids].sort());
    expect((await store.listRecentReplays(50)).map((r) => r.gameId)).toEqual([...ids].reverse());
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
