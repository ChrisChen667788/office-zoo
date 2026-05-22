/**
 * talkshowUgcStore — v6.1 UGC 段子投稿持久化。
 *
 * On disk: packages/server/data/user_talkshow_submissions.json
 *
 * 设计意图:
 *   1. 任何用户都能投稿段子, 自动过 auto-moderation 后进入 'pending' 状态
 *   2. 月度精选 endpoint 拉过去 30 天 likes 最高的 5 条
 *   3. Maker (你) 手动通过 status='approved' 后才进精选池
 *   4. 'rejected' 状态不删, 留存 audit log
 *
 * NOT a real CMS — JSON file + 50 条 cap per user, 体量上限自然控制。
 * 真要做大平台拓展到 Phase D (UGC 剧本平台 v0.8.0 系列) 再升级到 DB。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_talkshow_submissions.json');

const MAX_PER_USER = 50;
const MAX_TOTAL = 5000;

export type UgcStatus = 'pending' | 'approved' | 'rejected';
export type UgcTag = 'overtime' | 'kpi' | 'pua' | 'age' | 'slacking' | 'jargon' | 'hr' | 'boss' | 'meta';

export interface TalkshowUgcEntry {
  id: string;               // 'ugc-<timestamp>-<rand>'
  userId: string;           // submitter (X-User-Id)
  title: string;
  text: string;
  tag: UgcTag;
  region?: string;          // 'beijing' | 'shanghai' | ...
  createdAt: number;        // unix ms
  status: UgcStatus;
  rejectionReason?: string; // when status='rejected'
  likes: number;            // 点赞数, 月度精选排序用
  /** Optional rationale for auto-moderation flag. */
  modNotes?: string;
}

interface StoreShape {
  byId: Record<string, TalkshowUgcEntry>;
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
    console.error('[talkshowUgcStore] load failed:', err);
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

/**
 * 简易 auto-moderation — 长度 + 关键词黑名单。
 * 通过 → 'pending' (等人审核), 失败 → 'rejected'。
 *
 * 关键词黑名单刻意保守 — 政治 / 直接攻击具体公司或个人 / 色情 / 暴力。
 * "公司话术" 类调侃 (如 拥抱变化 / 颗粒度) 全部允许 — 那本来就是产品调性。
 */
function autoModerate(text: string, title: string): { ok: boolean; reason?: string } {
  if (text.length < 30 || text.length > 800) {
    return { ok: false, reason: '长度需在 30-800 字之间' };
  }
  if (title.length < 4 || title.length > 40) {
    return { ok: false, reason: '标题需 4-40 字' };
  }
  // 黑名单 — 保守, 不点名公司 / 政治敏感 / 明显攻击
  const blacklist = [
    /习|毛|江|胡|温|李克|赵|薄|周永康/, // 国家领导人
    /六四|天安门|新疆|藏独|港独|台独|疆独|法轮/, // 政治敏感
    /\b(?:阿里|腾讯|百度|字节|美团|快手|京东|拼多多|京东|滴滴|微博|抖音|小红书|蚂蚁|网易|搜狐|新浪|华为|小米|联想)\b/, // 公司明指名
    /操你|傻逼|cao\s?ni|fuck|傻屄|妈的|nmsl|cnm/i, // 直接脏话
    /色情|做爱|裸|aV|porn|sex|约炮/i, // 色情
    /杀人|爆炸|恐怖|血腥|自杀.*?方法/i, // 暴力 / 自残
  ];
  for (const re of blacklist) {
    if (re.test(text) || re.test(title)) {
      return { ok: false, reason: '触发关键词审查 (公司/政治/色情/暴力)' };
    }
  }
  return { ok: true };
}

function genId(): string {
  return `ugc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function submitTalkshow(input: {
  userId: string;
  title: string;
  text: string;
  tag: UgcTag;
  region?: string;
}): Promise<{ ok: true; entry: TalkshowUgcEntry } | { ok: false; reason: string }> {
  const s = await ensureLoaded();

  // Total cap (anti-DOS)
  if (Object.keys(s.byId).length >= MAX_TOTAL) {
    return { ok: false, reason: '段子库已满, 请等月底清理' };
  }
  // Per-user cap
  const userCount = Object.values(s.byId).filter((e) => e.userId === input.userId).length;
  if (userCount >= MAX_PER_USER) {
    return { ok: false, reason: `每用户上限 ${MAX_PER_USER} 条, 你已经达到` };
  }

  const mod = autoModerate(input.text, input.title);
  const entry: TalkshowUgcEntry = {
    id: genId(),
    userId: input.userId.slice(0, 64),
    title: input.title.trim(),
    text: input.text.trim(),
    tag: input.tag,
    region: input.region,
    createdAt: Date.now(),
    status: mod.ok ? 'pending' : 'rejected',
    rejectionReason: mod.ok ? undefined : mod.reason,
    likes: 0,
    modNotes: mod.ok ? 'auto-moderation passed' : `auto-rejected: ${mod.reason}`,
  };
  s.byId[entry.id] = entry;
  await persist(s);
  return { ok: true, entry };
}

/**
 * 月度精选 — 过去 30 天创建 + 已审核, 按 likes desc 取 top N。
 * 默认 N=5 (展示在 talkshow 首页 "★ 本月精选 UGC" section)。
 */
export async function getMonthlyHighlights(limit = 5): Promise<TalkshowUgcEntry[]> {
  const s = await ensureLoaded();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return Object.values(s.byId)
    .filter((e) => e.status === 'approved' && e.createdAt > cutoff)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit);
}

/** 用户拉自己的投稿历史 (含 pending / rejected, 用于 "我的投稿" 页面)。 */
export async function listUserSubmissions(userId: string): Promise<TalkshowUgcEntry[]> {
  const s = await ensureLoaded();
  return Object.values(s.byId)
    .filter((e) => e.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Maker 端: 拉所有 pending 等审核。 */
export async function listPending(): Promise<TalkshowUgcEntry[]> {
  const s = await ensureLoaded();
  return Object.values(s.byId)
    .filter((e) => e.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt); // 老的先审
}

/** Maker 端: 手动 approve / reject。 */
export async function reviewSubmission(
  id: string,
  decision: 'approved' | 'rejected',
  rejectionReason?: string,
): Promise<TalkshowUgcEntry | null> {
  const s = await ensureLoaded();
  const e = s.byId[id];
  if (!e) return null;
  e.status = decision;
  if (decision === 'rejected') {
    e.rejectionReason = rejectionReason ?? 'manual review';
  } else {
    e.rejectionReason = undefined;
  }
  await persist(s);
  return e;
}

/** 点赞 — 没做反作弊, 主要给前端体验, 真要做防刷再说。 */
export async function likeSubmission(id: string): Promise<TalkshowUgcEntry | null> {
  const s = await ensureLoaded();
  const e = s.byId[id];
  if (!e || e.status !== 'approved') return null;
  e.likes += 1;
  await persist(s);
  return e;
}
