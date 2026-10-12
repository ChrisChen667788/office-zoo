/**
 * aiClient — v6.167 — 全仓唯一的模型凭据入口(BYOK)。
 *
 * owner 决策:产品本身不提供模型 API。托管版(LLM_KEY_MODE=byok,hosted 默认)的每一次模型调用
 * 都用访客在浏览器里配置的 key;服务器只做转发——不持有、不落盘、不记录。本机自部署
 * (LLM_KEY_MODE=server,local 默认)照旧读 .env;访客若在页面里配了 key,本机也优先用访客的。
 *
 * 凭据怎么到这里:
 *   - HTTP:byokMiddleware 解析 X-Byok 请求头,用 AsyncLocalStorage 把它绑到这次请求的整条
 *     异步调用链上(包括请求里 fire-and-forget 出去的任务);
 *   - Socket.IO:握手 auth.byok → socket.data.byok;对局把建局者的凭据存在引擎上,所有驱动引擎
 *     的入口(开局、真人发言、席位操作……)都在 runWithAi(引擎凭据) 里执行。
 * 业务代码只调 chatModel() / ttsTarget() / embeddingsAllowed(),从不直接读环境变量里的 key。
 *
 * 为什么不再有模块级单例:过去 15 个文件各自 `let _openai = createOpenAI(...)` 首次调用时把 .env
 * 的 key 烤进去,之后所有人共用——在 BYOK 下这意味着第一个访客的 key 会被后来的人用掉。
 * 现在每次调用按当前上下文现建客户端(创建成本可忽略)。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from '@ai-sdk/provider';
import {
  findProvider,
  resolveBaseURL,
  type ByokConfig,
} from '@furball/shared';
import { isHosted } from './deployProfile';

export type KeyMode = 'server' | 'byok';
export type ModelTier = 'fast' | 'main' | 'premium';
export type AiFailReason = 'need_key' | 'key_rejected' | 'quota' | 'rate_limited';

export interface AiContext {
  byok: ByokConfig | null;
  /** 对局用:访客的 key 被拒 / 欠费时通知房间(只通知一次由调用方节流)。 */
  onFailure?: (reason: AiFailReason) => void;
  /** HTTP 用:这次请求里出现过的、访客能自己处理的失败;中间件据此回 X-Llm-Error 头。 */
  failures?: Set<AiFailReason>;
  /** 请求带了凭据但校验没过(格式不对 / 自定义地址被拒)的原因。 */
  byokError?: string;
}

const als = new AsyncLocalStorage<AiContext>();

/** LLM_KEY_MODE 显式设置优先;否则 hosted → byok,local → server。 */
export function keyMode(): KeyMode {
  const raw = process.env.LLM_KEY_MODE?.trim().toLowerCase();
  if (raw === 'byok' || raw === 'server') return raw;
  return isHosted() ? 'byok' : 'server';
}

/** 在给定凭据上下文里执行 fn;fn 发起的整条异步调用链(含 fire-and-forget)都看得到这份凭据。 */
export function runWithAi<T>(ctx: AiContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function currentAi(): AiContext | undefined {
  return als.getStore();
}

export function currentByok(): ByokConfig | null {
  return als.getStore()?.byok ?? null;
}

export function reportAiFailure(reason: AiFailReason): void {
  const ctx = als.getStore();
  ctx?.failures?.add(reason);
  try { ctx?.onFailure?.(reason); } catch { /* 通知失败不影响调用方 */ }
}

/** 当前上下文能不能调用文本模型(用于在动手前就提示「先配置模型」)。 */
export function hasChatAccess(): boolean {
  return currentByok() !== null || keyMode() === 'server';
}

// ---------------------------------------------------------------------------
// 文本模型
// ---------------------------------------------------------------------------

/** 没有可用凭据时返回的占位模型:一调用就抛 NeedKeyError,由 callLLMWithTimeout 转成 need_key。 */
export class NeedKeyError extends Error {
  readonly code = 'need_key';
  constructor() {
    super('No model credentials configured (BYOK: configure your own model key)');
    this.name = 'NeedKeyError';
  }
}

function needKeyModel(): LanguageModelV1 {
  const fail = async (): Promise<never> => { throw new NeedKeyError(); };
  return {
    specificationVersion: 'v1',
    provider: 'byok',
    modelId: 'need-key',
    defaultObjectGenerationMode: undefined,
    doGenerate: fail,
    doStream: fail,
  };
}

function envChatProvider() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.QINGYUN_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1',
  });
}

function byokChatProvider(cfg: ByokConfig) {
  return createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: resolveBaseURL(cfg),
    // 第三方 OpenAI 兼容接口:不发 OpenAI 专有参数(stream_options 等)
    compatibility: cfg.provider === 'openai' ? 'strict' : 'compatible',
    name: `byok.${cfg.provider}`,
    ...(cfg.provider === 'openrouter' ? { headers: { 'X-Title': 'OFFICE ZOO' } } : {}),
  });
}

/**
 * 取一个文本模型。
 * @param tier          访客配置下用哪一档:fast = 投票等短输出(用 fastModel,没填用 model);
 *                      main / premium = 发言、HR 对话、编剧等(用 model)
 * @param serverModelId 本机 .env 模式下沿用各调用点原有的模型选择(OPENAI_MODEL / FIRED_HR_MODEL …)
 */
export function chatModel(tier: ModelTier, serverModelId: string): LanguageModelV1 {
  const byok = currentByok();
  if (byok) {
    const id = tier === 'fast' ? byok.fastModel ?? byok.model : byok.model;
    return byokChatProvider(byok)(id) as unknown as LanguageModelV1;
  }
  if (keyMode() === 'byok') return needKeyModel();
  return envChatProvider()(serverModelId) as unknown as LanguageModelV1;
}

/** 部分国产模型只接受 temperature ≤ 1:按访客选的模型商截断。 */
export function clampTemperature(t: number | undefined): number | undefined {
  if (t === undefined) return undefined;
  const byok = currentByok();
  if (!byok) return t;
  const cap = findProvider(byok.provider)?.maxTemperature ?? 1;
  return Math.max(0.01, Math.min(t, cap));
}

/** 本机 .env 的 MiniMax 文本兜底只在 server 模式、且这次调用没有访客凭据时使用。 */
export function envFallbackAllowed(): boolean {
  return keyMode() === 'server' && currentByok() === null;
}

// ---------------------------------------------------------------------------
// 语音 / 向量
// ---------------------------------------------------------------------------

export type TtsTarget =
  | { kind: 'env' }
  | { kind: 'none' }
  | { kind: 'minimax'; key: string; groupId?: string; base: string }
  | { kind: 'openai'; baseURL: string; apiKey: string; model: string; voices: { female: string; male: string } };

/**
 * 语音合成用谁的 key:
 *   - 访客配置了:browser(默认)→ none(前端用浏览器朗读,零费用);provider → 同一家的
 *     /audio/speech;minimax → 访客另填的 MiniMax 语音 key;
 *   - 没配置:server 模式走 .env 原链路,byok 模式 none。
 */
export function ttsTarget(): TtsTarget {
  const byok = currentByok();
  if (byok) {
    const mode = byok.tts?.mode ?? 'browser';
    if (mode === 'minimax' && byok.tts?.minimaxKey) {
      return { kind: 'minimax', key: byok.tts.minimaxKey, groupId: byok.tts.minimaxGroupId, base: 'https://api.minimaxi.com/v1' };
    }
    const preset = findProvider(byok.provider);
    if (mode === 'provider' && preset?.tts) {
      return { kind: 'openai', baseURL: resolveBaseURL(byok), apiKey: byok.apiKey, model: preset.tts.model, voices: preset.tts.voices };
    }
    return { kind: 'none' };
  }
  return keyMode() === 'server' ? { kind: 'env' } : { kind: 'none' };
}

/** 记忆向量:只在本机 .env 模式用运营方 key;访客的 key 不拿来做向量(多数模型商不支持同 key 向量)。 */
export function embeddingsAllowed(): boolean {
  return keyMode() === 'server' && currentByok() === null;
}

// ---------------------------------------------------------------------------
// 自定义 base URL 的 SSRF 防护
// ---------------------------------------------------------------------------

/** 托管版默认关闭自定义 base URL(BYOK_ALLOW_CUSTOM_BASE_URL=1 打开);本机默认允许。 */
export function customBaseUrlAllowed(): boolean {
  const raw = process.env.BYOK_ALLOW_CUSTOM_BASE_URL?.trim();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return !isHosted();
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
}

function inV4(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4', '255.255.255.255/32',
];

/** 内网、回环、链路本地(含云元数据 169.254.169.254)、组播、保留地址一律视为不安全。 */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return BLOCKED_V4.some((c) => inV4(ip, c));
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]);
    return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8')
      || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff') || s.startsWith('64:ff9b');
  }
  return true;
}

export type BaseUrlCheck = { ok: true } | { ok: false; reason: string };

const verdictCache = new Map<string, { at: number; verdict: BaseUrlCheck }>();
const VERDICT_TTL_MS = 10 * 60_000;

/**
 * 校验自定义 base URL:托管下必须 https、不能是 IP 字面量 / localhost,且 DNS 解析出的每个
 * 地址都必须是公网地址。结果按 host 缓存 10 分钟。
 * 残余风险:DNS 重绑定(校验后到真正连接之间换解析)——所以托管版默认关闭自定义地址。
 */
export async function checkCustomBaseUrl(raw: string, lookupFn: typeof lookup = lookup): Promise<BaseUrlCheck> {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'invalid_url' }; }
  if (!customBaseUrlAllowed()) return { ok: false, reason: 'custom_base_url_disabled' };
  const hosted = isHosted();
  if (u.protocol !== 'https:' && (hosted || u.protocol !== 'http:')) return { ok: false, reason: 'https_required' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (hosted && (net.isIP(host) || host === 'localhost' || host.endsWith('.localhost') || !host.includes('.'))) {
    return { ok: false, reason: 'host_not_allowed' };
  }
  if (!hosted) return { ok: true }; // 本机自部署:自己的机器、自己的网络,不拦内网地址(本地模型服务很常见)
  const cached = verdictCache.get(host);
  if (cached && Date.now() - cached.at < VERDICT_TTL_MS) return cached.verdict;
  let verdict: BaseUrlCheck;
  try {
    const addrs = await lookupFn(host, { all: true, verbatim: true });
    verdict = addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address))
      ? { ok: true }
      : { ok: false, reason: 'resolves_to_private_address' };
  } catch {
    verdict = { ok: false, reason: 'dns_failed' };
  }
  verdictCache.set(host, { at: Date.now(), verdict });
  return verdict;
}

export function __clearBaseUrlCacheForTest(): void {
  verdictCache.clear();
}
