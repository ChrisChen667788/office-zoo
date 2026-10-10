/**
 * analytics — v6.163 — 最小埋点(Umami,可选启用)。
 *
 *   - 服务器没配置 UMAMI_SCRIPT_URL / UMAMI_WEBSITE_ID 时完全 no-op:不加载任何第三方脚本、
 *     不发任何请求。
 *   - 配置后加载 Umami 脚本(无 cookie;带 data-do-not-track,尊重浏览器的「请勿跟踪」),
 *     页面浏览由脚本自动统计,这里只补业务事件。
 *   - 事件名是白名单;属性只留数字 / 布尔 / ≤64 字的短字符串,看起来像密钥的值直接丢掉——
 *     BYOK 之后浏览器里有用户的模型 key,埋点绝不能把它带出去。
 */
import { getRuntimeConfig } from './runtimeConfig';

export type AnalyticsEvent =
  | 'game_start'
  | 'game_first_llm_response'
  | 'game_complete'
  | 'fired_chapter_complete'
  | 'share_card_generated'
  | 'video_export_clicked'
  | 'premium_cta_clicked'
  | 'byok_open'
  | 'byok_saved'
  | 'byok_test'
  | 'sample_replay_view';

export type EventData = Record<string, string | number | boolean | null | undefined>;

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const SECRET_LIKE = /(sk|pk|ak|ms|mpg)[-_][A-Za-z0-9_-]{8,}|bearer\s|[A-Za-z0-9_-]{32,}/i;

/** 只保留安全、短小的属性。导出给测试。 */
export function sanitizeEventData(data: EventData | undefined): Record<string, string | number | boolean> | undefined {
  if (!data) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!KEY_RE.test(k) || v === null || v === undefined) continue;
    if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = Math.round(v * 1000) / 1000; continue; }
    if (typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'string') {
      if (SECRET_LIKE.test(v)) continue;
      out[k] = v.slice(0, 64);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

interface UmamiApi { track: (name: string, data?: Record<string, unknown>) => void }
declare global { interface Window { umami?: UmamiApi } }

type State = 'idle' | 'loading' | 'ready' | 'disabled';
let state: State = 'idle';
const queue: Array<[AnalyticsEvent, Record<string, string | number | boolean> | undefined]> = [];
const MAX_QUEUE = 50;

function flush() {
  const api = typeof window !== 'undefined' ? window.umami : undefined;
  if (!api) return;
  while (queue.length) {
    const [name, data] = queue.shift()!;
    try { api.track(name, data); } catch { /* 统计失败不影响业务 */ }
  }
}

/** 应用启动时调用一次。 */
export async function initAnalytics(): Promise<void> {
  if (state !== 'idle' || typeof document === 'undefined') return;
  state = 'loading';
  const cfg = await getRuntimeConfig();
  const umami = cfg.analytics.umami;
  if (!umami) { state = 'disabled'; queue.length = 0; return; }
  const s = document.createElement('script');
  s.defer = true;
  s.src = umami.scriptUrl;
  s.dataset.websiteId = umami.websiteId;
  s.dataset.doNotTrack = 'true';
  s.onload = () => { state = 'ready'; flush(); };
  s.onerror = () => { state = 'disabled'; queue.length = 0; };
  document.head.appendChild(s);
}

export function trackEvent(name: AnalyticsEvent, data?: EventData): void {
  if (state === 'disabled') return;
  const clean = sanitizeEventData(data);
  if (state === 'ready') {
    try { window.umami?.track(name, clean); } catch { /* ignore */ }
    return;
  }
  if (queue.length < MAX_QUEUE) queue.push([name, clean]);
}

/** 测试用。 */
export function __analyticsStateForTest() {
  return { state, queued: queue.length };
}
export function __resetAnalyticsForTest() {
  state = 'idle';
  queue.length = 0;
}
