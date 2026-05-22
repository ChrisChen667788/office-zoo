/**
 * barClusterStore — v6.1 朋友拼版彩蛋。
 *
 * 当用户 A 在酒馆跟某 archetype AI 聊完, share 链接给朋友 B。
 * B 点开 → 也跟同一个 archetype 聊几句 → A + B 的对话片段被合并成一个
 * "群像 cluster", 后续可生成"朋友拼版" share 截图。
 *
 * 设计意图: 让 1-on-1 聊天变成"我们这群朋友"的群体记忆 — 多个朋友共享同
 * 一个 AI 同事的视角形成 viral loop。
 *
 * 数据形状:
 *   cluster_id  (host 创建时生成)
 *   archetype   (固定, 一个 cluster 只聊一个 archetype)
 *   participants:
 *     - userId        (X-User-Id)
 *     - displayName?  (可选, 用户自己命名, 不填默认 "朋友 N")
 *     - joinedAt
 *     - snippets[]    (从他们 bar 对话里挑的"金句", 默认取最长的 1-2 条)
 *   maxParticipants: 8 (类似 squad 上限, 防一个 cluster 无限扩)
 *
 * 持久化: JSON file, 跟 squadHistoryStore 同 pattern。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bar_clusters.json');

const MAX_PARTICIPANTS = 8;
const MAX_SNIPPETS_PER_USER = 3;
const SNIPPET_MAX_LEN = 80;
const CLUSTER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 day

export interface ClusterSnippet {
  who: 'user' | 'ai';
  text: string;
  ts: number;
}

export interface ClusterParticipant {
  userId: string;
  displayName?: string;
  joinedAt: number;
  snippets: ClusterSnippet[];
}

export interface BarCluster {
  id: string;
  archetype: string;          // 'passive_aggressive' etc
  hostUserId: string;
  createdAt: number;
  participants: ClusterParticipant[];
}

interface StoreShape {
  byId: Record<string, BarCluster>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byId || typeof parsed.byId !== 'object') return { byId: {} };
    return { byId: parsed.byId };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byId: {} };
    console.error('[barClusterStore] load failed:', err);
    return { byId: {} };
  }
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((s) => { cache = s; return s; });
  return loadPromise;
}

async function persist(state: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

function genId(): string {
  return `bcl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 提取 transcript 的金句 — 长度 30-80 字之间最像"段子", 取 user/ai 各
 *  最长的 1-2 条。简单 heuristic, v6.2 可以接 LLM "挑金句"。 */
function extractSnippets(transcript: Array<{ role: 'user' | 'assistant'; content: string }>): ClusterSnippet[] {
  const candidates = transcript
    .map((m) => ({
      who: m.role === 'user' ? 'user' as const : 'ai' as const,
      text: m.content.trim().slice(0, SNIPPET_MAX_LEN),
      ts: Date.now(),
      score: Math.min(m.content.length, 80) - Math.abs(m.content.length - 50), // 50 字最优
    }))
    .filter((s) => s.text.length >= 10); // v6.2 — 酒馆短回复正常 10-19 字, 不该 filter
  // 取 user / ai 各 top 1.5 = 3 条总
  const userTop = candidates.filter((s) => s.who === 'user').sort((a, b) => b.score - a.score).slice(0, 2);
  const aiTop   = candidates.filter((s) => s.who === 'ai').sort((a, b) => b.score - a.score).slice(0, 2);
  return [...userTop, ...aiTop].slice(0, MAX_SNIPPETS_PER_USER);
}

/** Host 创建 cluster, 带上 host 自己的对话片段。 */
export async function createCluster(input: {
  hostUserId: string;
  archetype: string;
  hostDisplayName?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<BarCluster> {
  const s = await ensureLoaded();
  // GC: 删 30 天前的
  const cutoff = Date.now() - CLUSTER_TTL_MS;
  for (const id of Object.keys(s.byId)) {
    if (s.byId[id].createdAt < cutoff) delete s.byId[id];
  }
  const cluster: BarCluster = {
    id: genId(),
    archetype: input.archetype,
    hostUserId: input.hostUserId,
    createdAt: Date.now(),
    participants: [{
      userId: input.hostUserId,
      displayName: input.hostDisplayName,
      joinedAt: Date.now(),
      snippets: extractSnippets(input.transcript),
    }],
  };
  s.byId[cluster.id] = cluster;
  await persist(s);
  return cluster;
}

/** B 加入 cluster, 追加自己的对话片段。同 userId 重复 join 会更新而非追加。 */
export async function joinCluster(input: {
  clusterId: string;
  userId: string;
  displayName?: string;
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<BarCluster | null> {
  const s = await ensureLoaded();
  const c = s.byId[input.clusterId];
  if (!c) return null;
  // Already at max?
  if (c.participants.length >= MAX_PARTICIPANTS &&
      !c.participants.some((p) => p.userId === input.userId)) {
    return null; // full
  }
  const existing = c.participants.find((p) => p.userId === input.userId);
  if (existing) {
    existing.snippets = extractSnippets(input.transcript);
    if (input.displayName) existing.displayName = input.displayName;
  } else {
    c.participants.push({
      userId: input.userId,
      displayName: input.displayName,
      joinedAt: Date.now(),
      snippets: extractSnippets(input.transcript),
    });
  }
  await persist(s);
  return c;
}

export async function getCluster(clusterId: string): Promise<BarCluster | null> {
  const s = await ensureLoaded();
  return s.byId[clusterId] ?? null;
}
