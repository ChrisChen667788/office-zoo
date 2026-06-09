/**
 * relationStore — v6.75 — 「AI 记忆关系网」跨局持久化。
 *
 * 一张按 **archetype id** 键的有向情绪图(谁记谁的仇 / 恩),跨局累积。每局每轮投票结果喂进来
 * (GameEngine round-end 钩子),落盘 JSON 在 packages/server/data/relations.json。累积/封顶/
 * 派生事件全复用 shared 纯引擎,store 只管 I/O。节点只有 ~9 个原型 → 边最多 ~72 条,不用 evict。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type RelationGraph, type RelationEvent, type RelationEdge,
  emptyGraph, applyEvents, topEdges, allEdges,
} from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'relations.json');

let cache: RelationGraph | null = null;
let loadPromise: Promise<RelationGraph> | null = null;

async function loadFromDisk(): Promise<RelationGraph> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RelationGraph>;
    if (!parsed.edges || typeof parsed.edges !== 'object') return emptyGraph();
    return { edges: parsed.edges as RelationGraph['edges'] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyGraph();
    console.error('[relationStore] load failed:', err);
    return emptyGraph();
  }
}
async function ensureLoaded(): Promise<RelationGraph> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((g) => { cache = g; return g; });
  return loadPromise;
}
let writeSeq = 0;
async function persist(g: RelationGraph): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // 唯一 tmp 名:即便有并发写也不会撞同一个临时文件(rename 仍原子)。
  const tmp = `${DATA_FILE}.${process.pid}.${++writeSeq}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(g, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

// 串行化所有 ingest:把整个 read-modify-write 挂在一条 promise 链上,避免并发 round/game
// 互相覆盖(last-write-lost)或抢临时文件。游戏侧 fire-and-forget,这里保证一次只跑一个。
let writeChain: Promise<void> = Promise.resolve();

/** 把一批跨局事件并进关系图并落盘(best-effort:失败只记日志,不阻断游戏)。 */
export async function ingestRelationEvents(events: readonly RelationEvent[]): Promise<void> {
  if (events.length === 0) return;
  writeChain = writeChain.then(async () => {
    try {
      const g = await ensureLoaded();
      const next = applyEvents(g, events);
      cache = next;
      await persist(next);
    } catch (err) {
      console.error('[relationStore] ingest failed:', (err as Error).message);
    }
  });
  return writeChain;
}

/** 整张图(给「关系网」UI 画);minAbs 过滤太淡的边。 */
export async function getRelationEdges(minAbs = 1): Promise<RelationEdge[]> {
  const g = await ensureLoaded();
  return allEdges(g, minAbs);
}

/** 某只鼠的情绪边(给个人关系卡 / 投票旧账用)。 */
export async function getEdgesFor(holderId: string, n?: number): Promise<RelationEdge[]> {
  const g = await ensureLoaded();
  return topEdges(g, holderId, n);
}

/** 原始图(测试 / 高级消费用)。 */
export async function getRelationGraph(): Promise<RelationGraph> {
  return ensureLoaded();
}

/** 测试用:重置内存缓存。 */
export function __resetRelationCacheForTest(): void {
  cache = null;
  loadPromise = null;
}
