/**
 * capabilityCache — v6.169.5 — 模型能力检测结果的本地缓存。
 *
 * 指纹用 SHA-256 前 16 个十六进制字符(32 位);server 模式只用 model 参与哈希,
 * 拿不到服务器 key,也不需要缓存 key。
 * 存储用 localStorage,键 `office-zoo.capability.v1`,最多保留 8 条,7 天过期。
 * 读写全部包在 try/catch,隐私模式下不崩。
 * **绝不存 key 原文或任何 key 片段。**
 */
import type { CapabilityReport } from '@furball/shared';
import type { ByokConfig } from '@furball/shared';

const STORAGE_KEY = 'office-zoo.capability.v1';
const MAX_ENTRIES = 8;
/** 7 天过期 (ms) */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  report: CapabilityReport;
  savedAt: number;
}

type CacheStore = Record<string, CacheEntry>;

// ---------------------------------------------------------------------------
// 指纹计算
// ---------------------------------------------------------------------------

/**
 * 计算 byok 或 server 配置的指纹。
 * byok: sha256(provider + '\n' + (baseURL ?? '') + '\n' + model + '\n' + apiKey) → 前 16 hex
 * server: sha256('server\n' + model) → 前 16 hex
 */
export async function fingerprintFor(
  cfg: ByokConfig | { source: 'server'; model: string },
): Promise<string> {
  let raw: string;
  if ('source' in cfg && cfg.source === 'server') {
    raw = `server\n${cfg.model}`;
  } else {
    const c = cfg as ByokConfig;
    raw = `${c.provider}\n${c.baseURL ?? ''}\n${c.model}\n${c.apiKey}`;
  }
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) return fnv1a64(raw);
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

/**
 * crypto.subtle 只在安全上下文(https / localhost)里有;局域网攒局用 http://192.168.x.x 打开时没有。
 * 这时退回 FNV-1a 64 位:只用来对上缓存条目,64 位摘要反推不出高熵的 key。前缀 f 与 SHA 指纹区分开。
 */
export function fnv1a64(raw: string): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(raw)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return 'f' + h.toString(16).padStart(16, '0').slice(1);
}

// ---------------------------------------------------------------------------
// 存储读写
// ---------------------------------------------------------------------------

function getLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStore(): CacheStore {
  try {
    const raw = getLocalStorage()?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheStore;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  try {
    getLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 存储抛错(隐私模式或已满)静默忽略
  }
}

/** 淘汰最旧的条目,保证最多 MAX_ENTRIES 条。 */
function evict(store: CacheStore): CacheStore {
  const keys = Object.keys(store);
  if (keys.length <= MAX_ENTRIES) return store;
  // 按 savedAt 升序,淘汰最旧的
  keys.sort((a, b) => (store[a]?.savedAt ?? 0) - (store[b]?.savedAt ?? 0));
  const toRemove = keys.slice(0, keys.length - MAX_ENTRIES);
  const next = { ...store };
  for (const k of toRemove) delete next[k];
  return next;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/** 读取缓存条目(报告 + 写入时间);7 天过期或内容不像报告时返回 null。 */
export function readCapabilityEntry(fp: string): { report: CapabilityReport; savedAt: number } | null {
  try {
    const entry = readStore()[fp];
    if (!entry || typeof entry.savedAt !== 'number' || !entry.report || !Array.isArray(entry.report.items)) return null;
    if (Date.now() - entry.savedAt > TTL_MS) return null;
    return { report: entry.report, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

/** 读取缓存;7 天过期返回 null。 */
export function readCapability(fp: string): CapabilityReport | null {
  return readCapabilityEntry(fp)?.report ?? null;
}

/** 写入缓存,自动淘汰超出 MAX_ENTRIES 的最旧条目。 */
export function writeCapability(fp: string, report: CapabilityReport): void {
  try {
    let store = readStore();
    store[fp] = { report, savedAt: Date.now() };
    store = evict(store);
    writeStore(store);
  } catch {
    // 写入失败静默忽略
  }
}
