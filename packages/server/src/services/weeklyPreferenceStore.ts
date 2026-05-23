/**
 * weeklyPreferenceStore — v6.5.2 周报风格 self-tuning 存储。
 *
 * 当用户在 /weekly 给某个风格点赞, 我们累积 per-user 的偏好计数。
 * 下次 generate 时, 后端读这个偏好 → 识别主导风格 → 对该风格:
 *   - LLM temperature +0.15 (让生成更狂野 / 更突出特征)
 *   - system prompt 末尾追加 "用户最爱你这种风格, 把特征发挥到极致"
 *
 * 设计意图: 让用户感到"AI 在听我的", 强化 viral loop —
 * "我点的赞影响了 AI 下次的语气" 是个 Z 世代体验亮点。
 *
 * 持久化: JSON file, sibling of squadHistoryStore / talkshowUgcStore /
 * fortuneHistoryStore / barClusterStore (同 pattern, 服务器重启不丢)。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'weekly_preferences.json');

export type WeeklyStyle = 'alibaba' | 'pua' | 'posh' | 'direct';

/** Likes per style. 0 = never liked. */
export type LikeCounts = Record<WeeklyStyle, number>;

interface StoreShape {
  byUser: Record<string, LikeCounts>;
}

const ZERO_COUNTS: LikeCounts = { alibaba: 0, pua: 0, posh: 0, direct: 0 };

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
    console.error('[weeklyPreferenceStore] load failed:', err);
    return { byUser: {} };
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

/** Add +1 like for (userId, style). Idempotent in the sense of "always
 *  bumps by 1" — no per-IP dedup at this layer (the route layer can add
 *  rate-limit if it wants). Returns the new counts for the user. */
export async function recordLike(userId: string, style: WeeklyStyle): Promise<LikeCounts> {
  if (!userId) return { ...ZERO_COUNTS };
  const s = await ensureLoaded();
  if (!s.byUser[userId]) s.byUser[userId] = { ...ZERO_COUNTS };
  s.byUser[userId][style] = (s.byUser[userId][style] ?? 0) + 1;
  await persist(s);
  return { ...s.byUser[userId] };
}

export async function getCounts(userId: string): Promise<LikeCounts> {
  if (!userId) return { ...ZERO_COUNTS };
  const s = await ensureLoaded();
  return { ...(s.byUser[userId] ?? ZERO_COUNTS) };
}

/** Identify the "dominant" style for self-tuning. Only kicks in once
 *  the user has accumulated ≥ MIN_TOTAL likes, so a single click doesn't
 *  warp future generations (and there's no early dominance from sample
 *  size 1). Returns null when below threshold or all-tied. */
const MIN_TOTAL = 3;
export function dominantStyle(counts: LikeCounts): WeeklyStyle | null {
  const total = (counts.alibaba ?? 0) + (counts.pua ?? 0) + (counts.posh ?? 0) + (counts.direct ?? 0);
  if (total < MIN_TOTAL) return null;
  const entries = (Object.entries(counts) as [WeeklyStyle, number][])
    .sort((a, b) => b[1] - a[1]);
  // Tie check: top tied with second → no clear dominance
  if (entries.length >= 2 && entries[0][1] === entries[1][1]) return null;
  return entries[0][0];
}

/** Clear (for test / "forget my preferences" surface). */
export async function clearPreferences(userId: string): Promise<void> {
  const s = await ensureLoaded();
  delete s.byUser[userId];
  await persist(s);
}
