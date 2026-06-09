/**
 * bettingStore — v6.74 P3 — 观众下注盘「全网战绩榜」持久化。
 *
 * 每个 userId 只留**身家最高一条**(按 shared 的 upsertBestBetRun 口径:峰值身家)。
 * 落盘 JSON 在 packages/server/data/betting_runs.json,distinct user 数封顶 MAX_RUNS_KEPT
 * (超了丢最旧 ts)。排序/留最佳全部复用 shared 纯函数,store 只管 I/O。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BetRun, type BetRunSubmit, type BetSortBy,
  upsertBestBetRun, rankBetRuns,
} from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'betting_runs.json');

const MAX_RUNS_KEPT = 2000;

interface StoreShape {
  byUser: Record<string, BetRun>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byUser || typeof parsed.byUser !== 'object') return { byUser: {} };
    return { byUser: parsed.byUser };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byUser: {} };
    console.error('[bettingStore] load failed:', err);
    return { byUser: {} };
  }
}
async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((s) => { cache = s; return s; });
  return loadPromise;
}
async function persist(s: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** Cap distinct users — drop oldest by ts when over MAX_RUNS_KEPT. */
function evictOldest(s: StoreShape): void {
  const all = Object.values(s.byUser);
  if (all.length <= MAX_RUNS_KEPT) return;
  const doomed = all.sort((a, b) => a.ts - b.ts).slice(0, all.length - MAX_RUNS_KEPT);
  for (const r of doomed) delete s.byUser[r.userId];
}

/**
 * 上报一次身家快照 → 与该 user 现有最佳比较,更阔才替换。返回这条 user 当前的最佳。
 * ts 服务端注入,不信任客户端。
 */
export async function submitBetRun(userId: string, submit: BetRunSubmit, ts: number): Promise<BetRun> {
  const s = await ensureLoaded();
  const run: BetRun = { ...submit, userId, ts };
  const existing = s.byUser[userId];
  const best = upsertBestBetRun(existing ? [existing] : [], run)[0];
  s.byUser[userId] = best;
  evictOldest(s);
  await persist(s);
  return best;
}

/** Top-N 战绩(筹码榜 / 神算榜)。 */
export async function topBetRuns(limit = 20, sortBy: BetSortBy = 'chips'): Promise<BetRun[]> {
  const s = await ensureLoaded();
  return rankBetRuns(Object.values(s.byUser), limit, sortBy);
}

/** Distinct-user 总数(给榜单显示「全网 N 位赌怪」)。 */
export async function totalBetRuns(): Promise<number> {
  const s = await ensureLoaded();
  return Object.keys(s.byUser).length;
}

/** 测试用:重置内存缓存。 */
export function __resetBetRunCacheForTest(): void {
  cache = null;
  loadPromise = null;
}
