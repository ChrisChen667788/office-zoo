/**
 * byok(前端)— v6.167 — 访客自己的模型 key 存在哪、怎么随请求带出去。
 *
 *   存储:默认 sessionStorage(关掉标签页就没了);勾选「在本机记住」才写 localStorage。
 *         两处只会有一份(切换时清掉另一处)。
 *   发送:只发给本站服务器——
 *         - fetch:installByokFetch() 给同源 /api/* 请求加 X-Byok 头(其它地址一律不加);
 *         - Socket.IO:握手 auth.byok(useSocket 读 currentByokHeader());改配置后重连。
 *   回馈:服务端在响应头 X-Llm-Error 里告诉我们「没配 key / key 被拒 / 欠费 / 限流」,这里转成事件,
 *         由 ModelSetupHost 弹设置面板或提示。
 *
 * 绝不把 key 写进 URL、埋点、日志或任何第三方请求。
 */
import { useSyncExternalStore } from 'react';
import { BYOK_HEADER, encodeByok, validateByok, type ByokConfig } from '@furball/shared';

const STORAGE_KEY = 'office-zoo.byok.v1';

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: ByokConfig | null | undefined;

function storages(): Array<Storage | null> {
  const get = (name: 'sessionStorage' | 'localStorage') => {
    try { return typeof window !== 'undefined' ? window[name] : null; } catch { return null; }
  };
  return [get('sessionStorage'), get('localStorage')];
}

function readStored(): ByokConfig | null {
  for (const st of storages()) {
    try {
      const raw = st?.getItem(STORAGE_KEY);
      if (!raw) continue;
      const v = validateByok(JSON.parse(raw));
      if (v.ok) return v.config;
    } catch { /* 坏数据当没有 */ }
  }
  return null;
}

export function getByok(): ByokConfig | null {
  if (cached === undefined) cached = readStored();
  return cached;
}

/** 当前配置是否「记在本机」(localStorage)。 */
export function isRemembered(): boolean {
  try { return !!storages()[1]?.getItem(STORAGE_KEY); } catch { return false; }
}

function notify() {
  for (const l of listeners) l();
}

/** 保存(先严格校验);remember=false 只存本标签页。返回校验错误或 null。 */
export function saveByok(cfg: ByokConfig, remember: boolean): string | null {
  const v = validateByok(cfg);
  if (!v.ok) return v.error;
  const [session, local] = storages();
  const text = JSON.stringify(v.config);
  try {
    if (remember) { local?.setItem(STORAGE_KEY, text); session?.removeItem(STORAGE_KEY); }
    else { session?.setItem(STORAGE_KEY, text); local?.removeItem(STORAGE_KEY); }
  } catch { /* 隐私模式写不进去:仍在内存里生效到刷新为止 */ }
  cached = v.config;
  notify();
  return null;
}

export function clearByok(): void {
  for (const st of storages()) { try { st?.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
  cached = null;
  notify();
}

export function subscribeByok(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useByok(): ByokConfig | null {
  return useSyncExternalStore(subscribeByok, getByok, getByok);
}

export function currentByokHeader(): string | null {
  const cfg = getByok();
  return cfg ? encodeByok(cfg) : null;
}

// ---------------------------------------------------------------------------
// 服务端回馈 → 前端事件
// ---------------------------------------------------------------------------

/** need_key_hint = 后台请求(每日剧情、弹幕台词等)缺 key:只轻提示,不弹窗。 */
export type LlmIssue = 'need_key' | 'need_key_hint' | 'key_rejected' | 'quota' | 'rate_limited' | 'invalid_config';
type IssueListener = (issue: LlmIssue) => void;
const issueListeners = new Set<IssueListener>();

export function onLlmIssue(l: IssueListener): () => void {
  issueListeners.add(l);
  return () => issueListeners.delete(l);
}

export function emitLlmIssue(issue: LlmIssue): void {
  for (const l of issueListeners) l(issue);
}

const KNOWN: ReadonlySet<string> = new Set(['need_key', 'key_rejected', 'quota', 'rate_limited']);

/** 解析 X-Llm-Error(逗号分隔)/ X-Byok-Error 头。导出给测试。 */
export function issuesFromHeaders(h: Pick<Headers, 'get'>): LlmIssue[] {
  const out: LlmIssue[] = [];
  for (const part of (h.get('X-Llm-Error') ?? '').split(',')) {
    const p = part.trim();
    if (KNOWN.has(p)) out.push(p as LlmIssue);
  }
  if (h.get('X-Byok-Error')) out.push('invalid_config');
  return out;
}

/** 只给本站 /api/* 加凭据头:绝对地址必须同源,其它站点一律不加。导出给测试。 */
export function shouldAttachByok(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === origin && u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

let installed = false;

/** 应用启动时调用一次:包一层 window.fetch。 */
export function installByokFetch(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const header = currentByokHeader();
    let nextInit = init;
    if (header && shouldAttachByok(url, window.location.origin)) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has(BYOK_HEADER)) headers.set(BYOK_HEADER, header);
      nextInit = { ...init, headers };
    }
    const res = await original(input, nextInit);
    if (shouldAttachByok(url, window.location.origin)) {
      // 响应头来的 need_key 多半出自后台请求(页面一打开就会拉每日剧情):只轻提示,
      // 主动入口(requireModel / 开局被拒)才弹设置窗。
      for (const issue of issuesFromHeaders(res.headers)) emitLlmIssue(issue === 'need_key' ? 'need_key_hint' : issue);
    }
    return res;
  };
}
