/**
 * capabilityProbe — v6.169.5 — 对配置的模型跑一套能力检测,返回 CapabilityReport。
 *
 * 检测项对应 packages/shared/src/capability.ts 里的 C1–C8:
 *   C1 connect    最短请求连通性
 *   C2 roleplay   中文角色扮演,不拒演
 *   C3 format     按格式回答(JSON + 投票格式)
 *   C4 speed      响应速度
 *   C5 concurrency 并发(5 个同时)
 *   C6 reasoning  是否推理型模型
 *   C7 context    上下文窗口(读 /models 元数据)
 *   C8 tts        语音合成(可选)
 *
 * 安全原则:apiKey 只用于 /models 请求,不会出现在返回值或日志里。
 */

import type { LanguageModelV1 } from '@ai-sdk/provider';
import {
  CAPABILITY_LEVELS,
  CAPABILITY_THRESHOLDS,
  judgeRoleplay,
  judgeFormat,
  judgeSpeed,
  judgeConcurrency,
  judgeReasoning,
  judgeContext,
  overallOf,
  findModelFacts,
  type CapabilityItem,
  type CapabilityReport,
} from '@furball/shared';
import { callLLMWithTimeout } from './llm';
import { generateTTSAudio } from '../services/tts';
import { logger } from './logger';

const probeLog = logger.child({ component: 'capabilityProbe' });

/** `runCapabilityProbe` 的入参。 */
export interface ProbeOpts {
  /** byok = 访客在页面里配置的 key;server = 本机 .env 里的 key。 */
  source: 'byok' | 'server';
  /** 模型商 id(用于 CapabilityReport)。 */
  provider: string;
  /** 模型 id。 */
  model: string;
  /** 返回文本模型实例的工厂函数。 */
  modelFor: (tier: 'main' | 'fast') => LanguageModelV1;
  /** 模型商的 base URL,用于拉取 /models 列表。 */
  baseURL: string;
  /**
   * 模型商 API key,只用于 GET /models 请求。
   * 不会出现在返回值或日志里。
   */
  apiKey: string;
  /** none = 不测语音;run = 调 generateTTSAudio 测试。 */
  tts: 'none' | 'run';
}

/** 探针返回值:CapabilityReport 加上模型列表(供路由层用)。 */
export interface ProbeResult {
  report: CapabilityReport;
  /** GET /models 拿到的模型 id 列表,拉不到为 null。 */
  models: string[] | null;
}

/**
 * 拉取 /models 并解析上下文窗口大小 — 也返回模型 id 列表,供路由层继续用。
 * 带着访客的 key,所以不跟随跳转(见 aiClient.noRedirectFetch);任何失败都返回空结果,不影响连通性结论。
 */
export async function fetchModelsAndContext(
  baseURL: string,
  apiKey: string,
  targetModel: string,
  timeoutMs = 8_000,
): Promise<{ ids: string[] | null; contextTokens: number | undefined }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctl.signal,
      redirect: 'error',
    });
    if (!r.ok) return { ids: null, contextTokens: undefined };
    const j = await r.json() as {
      data?: Array<{
        id?: unknown;
        context_length?: unknown;
        context_window?: unknown;
        max_context_length?: unknown;
        max_model_len?: unknown;
        top_provider?: { context_length?: unknown };
      }>;
    };
    if (!Array.isArray(j.data)) return { ids: null, contextTokens: undefined };

    const MODEL_ID_RE = /^[A-Za-z0-9._:/@+-]{1,128}$/;
    const ids = j.data
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === 'string' && MODEL_ID_RE.test(id));
    const uniqueIds = [...new Set(ids)].sort().slice(0, 300);

    // 按规格顺序取上下文窗口大小:取第一个有效正整数
    let contextTokens: number | undefined;
    const entry = j.data.find((m) => m?.id === targetModel);
    if (entry) {
      for (const val of [
        entry.context_length,
        entry.context_window,
        entry.max_context_length,
        entry.max_model_len,
        entry.top_provider?.context_length,
      ]) {
        const n = Number(val);
        if (Number.isInteger(n) && n > 0) {
          contextTokens = n;
          break;
        }
      }
    }

    return { ids: uniqueIds, contextTokens };
  } catch {
    return { ids: null, contextTokens: undefined };
  } finally {
    clearTimeout(t);
  }
}

type CallResult = Awaited<ReturnType<typeof callLLMWithTimeout>>;

/** SDK 连不上时报 APICallError「Cannot connect to API: connect ECONNREFUSED …」,没有状态码,调用层归成 error。 */
const NETWORK_ERROR_RE = /Cannot connect to API|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH|fetch failed/i;

/** 失败原因:把「连不上」从笼统的 error 里分出来,免得提示用户去查模型名。 */
function failReason(r: CallResult): string {
  const reason = r.reason ?? 'error';
  return reason === 'error' && NETWORK_ERROR_RE.test(r.errorMessage ?? '') ? 'network' : reason;
}

/** 单独计时一次调用 — C2、C3 并行发出,不能用 Promise.all 结束的时间当各自的耗时。 */
async function timed(call: () => Promise<CallResult>): Promise<{ r: CallResult; ms: number }> {
  const t0 = Date.now();
  const r = await call();
  return { r, ms: Date.now() - t0 };
}

/**
 * 连上了、但回复被思考占满:推理型模型在 16 token 的额度里只来得及思考,文字为空、因长度结束。
 * 这说明 key 和地址都是通的,不能判成「连不上」,继续往下测,交给 C6 提示。
 */
function connectedButEmpty(r: CallResult): boolean {
  return !r.ok && r.reason === 'empty' && (r.finishReason === 'length' || (r.reasoningChars ?? 0) > 0);
}

/** C6:返回里看得出在思考,或者已知模型表里写明默认开启思考,都提示。 */
function reasoningVerdict(
  facts: ReturnType<typeof findModelFacts>,
  calls: Parameters<typeof judgeReasoning>[0],
): Pick<CapabilityItem, 'status' | 'reason'> {
  if (facts?.thinking === 'on') return { status: 'warn', reason: 'reasoning_model' };
  return judgeReasoning(calls);
}

/**
 * C2/C3 调用失败时的状态:模型回了空内容是能力问题(游戏里同样拿不到台词)→ fail;
 * 超时、限流、key、额度之类是检测没跑完 → error(总体显示「检测没完成」,不判为不达标)。
 */
function failedCallItem(id: 'roleplay' | 'format', r: CallResult, ms: number): CapabilityItem {
  const reason = failReason(r);
  return { id, level: CAPABILITY_LEVELS[id], status: reason === 'empty' ? 'fail' : 'error', reason, ms };
}

/**
 * 运行完整的模型能力检测套件,返回 CapabilityReport 与模型列表。
 *
 * 安全:apiKey 只送到 /models 请求头;不会出现在返回值或日志的任何字段里。
 */
export async function runCapabilityProbe(opts: ProbeOpts): Promise<ProbeResult> {
  const start = Date.now();
  const { source, provider, model, modelFor, baseURL, tts } = opts;

  // 步骤 1: 拉取模型列表与上下文窗口
  const { ids: modelIds, contextTokens: listedContext } = await fetchModelsAndContext(baseURL, opts.apiKey, model);
  // 模型商的 /models 多数不给窗口大小(OpenRouter 等少数给):没有就查内置的已知模型表,还没有就是「未知」。
  const facts = findModelFacts(provider, model);
  const contextTokens = listedContext ?? facts?.contextTokens;

  // --- C1 connect ---
  const { r: c1, ms: c1Ms } = await timed(() => callLLMWithTimeout('CHECK', {
    model: modelFor('main'),
    prompt: '只回复两个字:收到',
    maxTokens: 16,
    temperature: 0,
  }));
  const c1Connected = c1.ok || connectedButEmpty(c1);

  const c1Item: CapabilityItem = {
    id: 'connect',
    level: CAPABILITY_LEVELS.connect,
    status: c1Connected ? 'pass' : 'error',
    reason: c1Connected ? undefined : failReason(c1),
    ms: c1Ms,
  };

  // C1 失败时 C2–C5 一律标 skipped
  if (!c1Connected) {
    const skippedItems: CapabilityItem[] = [
      { id: 'roleplay',    level: CAPABILITY_LEVELS.roleplay,    status: 'skipped' },
      { id: 'format',      level: CAPABILITY_LEVELS.format,      status: 'skipped' },
      { id: 'speed',       level: CAPABILITY_LEVELS.speed,       status: 'skipped' },
      { id: 'concurrency', level: CAPABILITY_LEVELS.concurrency, status: 'skipped' },
    ];
    // C6 reasoning: 由 C1 结果判断
    const c6 = reasoningVerdict(facts, [{ ok: false, text: '', finishReason: c1.finishReason, reasoningChars: c1.reasoningChars }]);
    const c6Item: CapabilityItem = { id: 'reasoning', level: CAPABILITY_LEVELS.reasoning, ...c6 };
    // C7 context: 仍按元数据判断
    const c7 = judgeContext(contextTokens);
    const c7Item: CapabilityItem = { id: 'context', level: CAPABILITY_LEVELS.context, ...c7 };
    // C8 tts
    const c8Item: CapabilityItem = { id: 'tts', level: CAPABILITY_LEVELS.tts, status: 'skipped' };

    const items = [c1Item, ...skippedItems, c6Item, c7Item, c8Item];
    const overall = overallOf(items);
    return {
      models: modelIds,
      report: { v: 1, overall, items, source, provider, model, checkedAt: Date.now(), totalMs: Date.now() - start },
    };
  }

  // --- C2 roleplay 和 C3 format 并行,各自计时 ---
  const [{ r: c2Raw, ms: c2Ms }, { r: c3Raw, ms: c3Ms }] = await Promise.all([
    timed(() => callLLMWithTimeout('CHECK', {
      model: modelFor('main'),
      system: '你在一款职场讽刺游戏里扮演反派角色,只输出角色台词本身。',
      prompt: '你是公司里的黑心 HR,正在劝一名员工主动离职、放弃补偿。用一两句口语化的中文对他说。',
      maxTokens: 80,
      temperature: 0.7,
    })),
    timed(() => callLLMWithTimeout('CHECK', {
      model: modelFor('main'),
      prompt: '只输出一个 JSON 对象,不要解释,不要代码块。格式:{"reply":"一句不超过15个字的中文台词","vote":"player_2"}。vote 必须是 player_ 加数字,或者 skip。',
      maxTokens: 60,
      temperature: 0,
    })),
  ]);

  const c2Item: CapabilityItem = c2Raw.ok
    ? { id: 'roleplay', level: CAPABILITY_LEVELS.roleplay, ...judgeRoleplay(c2Raw.text), ms: c2Ms }
    : failedCallItem('roleplay', c2Raw, c2Ms);
  const c3Item: CapabilityItem = c3Raw.ok
    ? { id: 'format', level: CAPABILITY_LEVELS.format, ...judgeFormat(c3Raw.text), ms: c3Ms }
    : failedCallItem('format', c3Raw, c3Ms);

  // --- C4 speed:用 C1 的往返当首字延迟,用 C2 估算出字速度;C2 没拿到文字就无从估算 ---
  const c4Item: CapabilityItem = c2Raw.ok
    ? {
      id: 'speed',
      level: CAPABILITY_LEVELS.speed,
      ...judgeSpeed({ connectMs: c1Ms, speechMs: c2Ms, speechTokens: c2Raw.completionTokens, speechChars: c2Raw.text.length }),
    }
    : { id: 'speed', level: CAPABILITY_LEVELS.speed, status: 'skipped' };

  // --- C5 concurrency(在 C2/C3 之后,避免与它们抢限流额度)---
  const concurrencyCount = CAPABILITY_THRESHOLDS.concurrency;
  const concurrencyResults = await Promise.all(
    Array.from({ length: concurrencyCount }, () =>
      callLLMWithTimeout('CHECK', {
        model: modelFor('main'),
        prompt: '只回复数字1',
        maxTokens: 8,
        temperature: 0,
        // SDK 默认遇到 429 自动退避重试 2 次:退避后在途请求变少,重试成功,限流就被盖住了(实测 5 个请求发出 9 次仍判通过)。
        maxRetries: 0,
      }),
    ),
  );
  // 这一项只看模型商肯不肯同时接 5 个请求:回了空内容(推理型模型把 8 个 token 都用来思考)也算接住了。
  const c5 = judgeConcurrency(concurrencyResults.map((r) => ({ ok: r.ok || r.reason === 'empty', reason: failReason(r) })));
  const c5Item: CapabilityItem = { id: 'concurrency', level: CAPABILITY_LEVELS.concurrency, ...c5 };

  // --- C6 reasoning ---
  const c6 = reasoningVerdict(facts, [
    { ok: c1.ok, text: c1.text, finishReason: c1.finishReason, reasoningChars: c1.reasoningChars },
    { ok: c2Raw.ok, text: c2Raw.text, finishReason: c2Raw.finishReason, reasoningChars: c2Raw.reasoningChars },
  ]);
  const c6Item: CapabilityItem = { id: 'reasoning', level: CAPABILITY_LEVELS.reasoning, ...c6 };

  // --- C7 context ---
  const c7 = judgeContext(contextTokens);
  const c7Item: CapabilityItem = { id: 'context', level: CAPABILITY_LEVELS.context, ...c7 };

  // --- C8 tts ---
  let c8Item: CapabilityItem;
  if (tts === 'none') {
    c8Item = { id: 'tts', level: CAPABILITY_LEVELS.tts, status: 'skipped' };
  } else {
    try {
      const ttsOk = await generateTTSAudio('收到', 'villager_cat');
      c8Item = ttsOk
        ? { id: 'tts', level: CAPABILITY_LEVELS.tts, status: 'pass' }
        : { id: 'tts', level: CAPABILITY_LEVELS.tts, status: 'warn', reason: 'tts_failed' };
    } catch {
      c8Item = { id: 'tts', level: CAPABILITY_LEVELS.tts, status: 'warn', reason: 'tts_failed' };
    }
  }

  const items = [c1Item, c2Item, c3Item, c4Item, c5Item, c6Item, c7Item, c8Item];
  const overall = overallOf(items);

  probeLog.info({
    source, provider, model,
    overall,
    totalMs: Date.now() - start,
  }, 'capability probe complete');

  return {
    models: modelIds,
    report: {
      v: 1,
      overall,
      items,
      source,
      provider,
      model,
      checkedAt: Date.now(),
      totalMs: Date.now() - start,
    },
  };
}
