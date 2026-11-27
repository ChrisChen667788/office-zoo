/**
 * v6.169.5 — runCapabilityProbe 能力检测套件测试。
 *
 * 所有 LLM 调用均 mock,绝不真正联网。
 * 覆盖:
 *   - 正常模型全过
 *   - 拒演 (C2 fail refused)
 *   - JSON 前后夹话 (C3 warn format_partial)
 *   - 不按格式 (C3 fail)
 *   - C1 失败时 C2–C5 skipped 且没有再发请求
 *   - 并发里有 429 (C5 warn rate_limited_concurrent,确认并行发出)
 *   - 推理型模型 (reasoning 字段非空 → C6 warn)
 *   - /models 带 context_length 与不带两种
 *   - 返回值和日志里不含 apiKey 原文
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModelV1 } from '@ai-sdk/provider';
import { APICallError } from 'ai';

/** 和真实上游一样的 HTTP 错误(classifyLlmError 只认 APICallError.statusCode)。 */
function httpError(statusCode: number): APICallError {
  return new APICallError({ message: `HTTP ${statusCode}`, url: 'https://api.example.com/v1/chat/completions', requestBodyValues: {}, statusCode });
}

// ----- mock ai(generateText) -----
const generatedCalls: Array<{ prompt?: unknown; system?: unknown; maxRetries?: unknown }> = [];

vi.mock('ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('ai')>();
  return {
    ...real,
    generateText: vi.fn(async (opts: { prompt?: string; system?: string; maxTokens?: number; temperature?: number; model?: unknown; abortSignal?: AbortSignal; maxRetries?: number }) => {
      generatedCalls.push({ prompt: opts.prompt, system: opts.system, maxRetries: opts.maxRetries });
      // 根据 prompt 分派返回
      return dispatchResponse(opts);
    }),
  };
});

// ----- mock tts -----
let ttsOk = true;
vi.mock('../../services/tts', () => ({
  generateTTSAudio: vi.fn(async () => (ttsOk ? new Uint8Array(100) : null)),
}));

// ----- mock logger -----
const logLines: string[] = [];
vi.mock('../logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../logger')>();
  const fake = {
    child: () => fake,
    info: (...a: unknown[]) => { logLines.push(JSON.stringify(a)); },
    warn: (...a: unknown[]) => { logLines.push(JSON.stringify(a)); },
    error: (...a: unknown[]) => { logLines.push(JSON.stringify(a)); },
    debug: (...a: unknown[]) => {},
    fatal: (...a: unknown[]) => {},
  };
  return { ...real, logger: fake };
});

// 响应策略:根据测试用例动态配置
type ResponseMode =
  | 'normal'          // 所有调用成功
  | 'c1_fail'         // C1 连接失败(401)
  | 'c2_refused'      // C2 拒演
  | 'c3_partial'      // C3 JSON 前后夹话
  | 'c3_broken'       // C3 格式完全不对
  | 'concurrency_429' // C5 并发请求里有 429
  | 'reasoning'       // C1 返回推理内容
  | 'reasoning_empty' // 推理型模型:每次都被思考占满额度,文字为空、因长度结束
  | 'c1_timeout'      // C1 超时
  | 'c2_slow'         // C2 慢、C3 快(并行时各自计时)
  | 'c1_network'      // C1 连不上(SDK 报 Cannot connect to API,没有状态码)
  | 'concurrency_timing' // C5 每个请求挂 5ms,用来量同时在途数
  | 'body_reasoning'; // 真实 SDK 的形状:思考内容只在原始返回体 choices[0].message.reasoning_content 里

let mode: ResponseMode = 'normal';
let c5InFlight = 0;
let c5MaxInFlight = 0;

function dispatchResponse(opts: { prompt?: string; system?: string; maxTokens?: number; temperature?: number; abortSignal?: AbortSignal }) {
  const prompt = String(opts.prompt ?? '');

  // C1 connect
  if (prompt.includes('只回复两个字')) {
    if (mode === 'c1_fail') throw httpError(401);
    if (mode === 'c1_timeout') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (mode === 'c1_network') throw new APICallError({ message: 'Cannot connect to API: connect ECONNREFUSED 127.0.0.1:4011', url: 'http://127.0.0.1:4011/v1/chat/completions', requestBodyValues: {} });
    if (mode === 'body_reasoning') return { text: '收到', finishReason: 'stop', usage: { completionTokens: 40, promptTokens: 5, totalTokens: 45 }, response: { body: { choices: [{ message: { content: '收到', reasoning_content: '用户只要两个字,那就回收到。' } }] } } };
    if (mode === 'reasoning_empty') return { text: '', finishReason: 'length', usage: { completionTokens: 16, promptTokens: 5, totalTokens: 21 }, reasoning: '用户让我只回复两个字,我先想想' };
    if (mode === 'reasoning') {
      return { text: '收到', finishReason: 'stop', usage: { completionTokens: 2, promptTokens: 5, totalTokens: 7 }, reasoning: '先想一想' };
    }
    return { text: '收到', finishReason: 'stop', usage: { completionTokens: 2, promptTokens: 5, totalTokens: 7 } };
  }

  // C2 roleplay
  if (prompt.includes('黑心 HR') || (opts.system ?? '').includes('反派角色')) {
    if (mode === 'reasoning_empty') return { text: '', finishReason: 'length', usage: { completionTokens: 80, promptTokens: 30, totalTokens: 110 }, reasoning: '我需要扮演一个 HR……' };
    if (mode === 'c2_slow') return new Promise((r) => setTimeout(() => r({ text: '公司要的是绩效,你自己好好想清楚。', finishReason: 'stop', usage: { completionTokens: 20, promptTokens: 30, totalTokens: 50 } }), 120));
    if (mode === 'c2_refused') return { text: '作为一个 AI,我无法扮演这种角色。', finishReason: 'stop', usage: { completionTokens: 15, promptTokens: 30, totalTokens: 45 } };
    return { text: '公司要的是绩效,你自己好好想清楚。', finishReason: 'stop', usage: { completionTokens: 20, promptTokens: 30, totalTokens: 50 } };
  }

  // C3 format
  if (prompt.includes('JSON 对象') && prompt.includes('vote')) {
    if (mode === 'reasoning_empty') return { text: '', finishReason: 'length', usage: { completionTokens: 60, promptTokens: 30, totalTokens: 90 } };
    if (mode === 'c3_partial') return { text: '当然!{"reply":"公司要的是绩效","vote":"player_2"}好的', finishReason: 'stop', usage: { completionTokens: 20, promptTokens: 30, totalTokens: 50 } };
    if (mode === 'c3_broken') return { text: '公司要的是绩效,你自己好好想清楚。', finishReason: 'stop', usage: { completionTokens: 15, promptTokens: 30, totalTokens: 45 } };
    return { text: '{"reply":"公司要的是绩效","vote":"player_2"}', finishReason: 'stop', usage: { completionTokens: 15, promptTokens: 30, totalTokens: 45 } };
  }

  // C5 并发(只回复数字1)
  if (prompt.includes('只回复数字1')) {
    if (mode === 'concurrency_timing') {
      // 每个请求挂 5ms,记录同时在途的最大数:串行发出时最多只有 1 个在途
      c5InFlight += 1; c5MaxInFlight = Math.max(c5MaxInFlight, c5InFlight);
      return new Promise((r) => setTimeout(() => { c5InFlight -= 1; r({ text: '1', finishReason: 'stop', usage: { completionTokens: 1, promptTokens: 5, totalTokens: 6 } }); }, 5));
    }
    if (mode === 'reasoning_empty') return { text: '', finishReason: 'length', usage: { completionTokens: 8, promptTokens: 5, totalTokens: 13 } };
    if (mode === 'concurrency_429') {
      // 偶数次请求返回 429
      const callNum = generatedCalls.filter((c) => String(c.prompt ?? '').includes('只回复数字1')).length;
      if (callNum % 2 === 0) {
        throw httpError(429);
      }
    }
    return { text: '1', finishReason: 'stop', usage: { completionTokens: 1, promptTokens: 5, totalTokens: 6 } };
  }

  return { text: '好的', finishReason: 'stop', usage: { completionTokens: 5, promptTokens: 10, totalTokens: 15 } };
}

// ----- mock fetch(/models) -----
let modelsFetch: (() => Promise<Response>) | null = null;

const originalFetch = global.fetch;
beforeEach(() => {
  generatedCalls.length = 0;
  logLines.length = 0;
  mode = 'normal';
  ttsOk = true;
  modelsFetch = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/models') && modelsFetch) return modelsFetch();
    // 默认:没有 context_length
    return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function dummyModel(): LanguageModelV1 {
  return {} as LanguageModelV1; // mock generateText 不实际用 model 对象
}

const BASE_OPTS = {
  source: 'byok' as const,
  provider: 'deepseek',
  model: 'test-model',
  modelFor: (_tier: 'main' | 'fast') => dummyModel(),
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-SECRET-KEY-should-not-appear-in-output',
  tts: 'none' as const,
};

const { runCapabilityProbe } = await import('../capabilityProbe');

describe('runCapabilityProbe', () => {
  it('正常模型:所有必需项 pass,overall = pass', async () => {
    const { report, models } = await runCapabilityProbe(BASE_OPTS);
    expect(report.overall).toBe('pass');
    const c1 = report.items.find((i) => i.id === 'connect');
    expect(c1?.status).toBe('pass');
    const c2 = report.items.find((i) => i.id === 'roleplay');
    expect(c2?.status).toBe('pass');
    const c3 = report.items.find((i) => i.id === 'format');
    expect(c3?.status).toBe('pass');
    expect(report.source).toBe('byok');
    expect(report.provider).toBe('deepseek');
    expect(report.model).toBe('test-model');
    expect(report.v).toBe(1);
    expect(report.checkedAt).toBeGreaterThan(0);
    expect(report.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('拒演(C2 fail refused)', async () => {
    mode = 'c2_refused';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c2 = report.items.find((i) => i.id === 'roleplay');
    expect(c2?.status).toBe('fail');
    expect(c2?.reason).toBe('refused');
    // overall 应为 fail(roleplay 是必需项)
    expect(report.overall).toBe('fail');
  });

  it('JSON 前后夹话(C3 warn format_partial)', async () => {
    mode = 'c3_partial';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c3 = report.items.find((i) => i.id === 'format');
    expect(c3?.status).toBe('warn');
    expect(c3?.reason).toBe('format_partial');
  });

  it('完全不按格式(C3 fail)', async () => {
    mode = 'c3_broken';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c3 = report.items.find((i) => i.id === 'format');
    expect(c3?.status).toBe('fail');
  });

  it('C1 失败:C2–C5 一律 skipped,没有再发请求', async () => {
    mode = 'c1_fail';
    const callsBefore = generatedCalls.length;
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c1 = report.items.find((i) => i.id === 'connect');
    expect(c1?.status).toBe('error');
    // C2–C5 全部 skipped
    for (const id of ['roleplay', 'format', 'speed', 'concurrency'] as const) {
      const item = report.items.find((i) => i.id === id);
      expect(item?.status, id).toBe('skipped');
    }
    // 只有 C1 那一个 generateText 调用
    expect(generatedCalls.length - callsBefore).toBe(1);
  });

  it('C1 key 被拒:原因是 key_rejected,总体是「检测没完成」而不是「不达标」', async () => {
    mode = 'c1_fail';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c1 = report.items.find((i) => i.id === 'connect');
    expect(c1).toMatchObject({ status: 'error', reason: 'key_rejected' });
    expect(report.overall).toBe('incomplete');
  });

  it('C1 超时:原因是 timeout,同样不发后续请求', async () => {
    mode = 'c1_timeout';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    expect(report.items.find((i) => i.id === 'connect')).toMatchObject({ status: 'error', reason: 'timeout' });
    expect(generatedCalls).toHaveLength(1);
  });

  it('推理型模型把额度全用来思考:连通算通过,接着测,台词为空判不达标,C6 提示', async () => {
    mode = 'reasoning_empty';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const byId = (id: string) => report.items.find((i) => i.id === id);
    expect(byId('connect')?.status).toBe('pass');
    expect(byId('roleplay')).toMatchObject({ status: 'fail', reason: 'empty' });
    expect(byId('format')).toMatchObject({ status: 'fail', reason: 'empty' });
    expect(byId('speed')?.status).toBe('skipped'); // 没拿到台词,无从估算出字速度
    expect(byId('reasoning')).toMatchObject({ status: 'warn', reason: 'reasoning_model' });
    expect(report.overall).toBe('fail');
    expect(generatedCalls.length).toBeGreaterThan(1);
  });

  it('连不上模型商:原因是 network,不说「模型名可能不对」', async () => {
    mode = 'c1_network';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    expect(report.items.find((i) => i.id === 'connect')).toMatchObject({ status: 'error', reason: 'network' });
    expect(report.overall).toBe('incomplete');
  });

  it('思考内容只在原始返回体里(@ai-sdk/openai 不解析 reasoning_content):C6 仍能识别', async () => {
    mode = 'body_reasoning';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    expect(report.items.find((i) => i.id === 'reasoning')).toMatchObject({ status: 'warn', reason: 'reasoning_model' });
  });

  it('并发探测关掉 SDK 自动重试(重试会把 429 盖住),其余探测沿用游戏里的默认', async () => {
    await runCapabilityProbe(BASE_OPTS);
    const c5 = generatedCalls.filter((c) => String(c.prompt ?? '').includes('只回复数字1'));
    expect(c5).toHaveLength(5);
    for (const c of c5) expect(c.maxRetries).toBe(0);
    const others = generatedCalls.filter((c) => !String(c.prompt ?? '').includes('只回复数字1'));
    for (const c of others) expect(c.maxRetries).toBeUndefined();
  });

  it('推理型模型并发请求都回了空内容:算模型商接住了,并发项不报失败', async () => {
    mode = 'reasoning_empty';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    expect(report.items.find((i) => i.id === 'concurrency')).toMatchObject({ status: 'pass', value: 5 });
  });

  it('/models 不给窗口大小时查内置的已知模型表;表里写明默认思考的模型 C6 也提示', async () => {
    const { report } = await runCapabilityProbe({ ...BASE_OPTS, provider: 'deepseek', model: 'deepseek-flash' });
    expect(report.items.find((i) => i.id === 'context')).toMatchObject({ status: 'pass', value: 1_000_000 });
    expect(report.items.find((i) => i.id === 'reasoning')).toMatchObject({ status: 'warn', reason: 'reasoning_model' });
  });

  it('/models 给了窗口大小就以它为准,不查表;表里没有的模型照旧是「未知」', async () => {
    modelsFetch = async () => new Response(JSON.stringify({ data: [{ id: 'deepseek-flash', context_length: 64_000 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const { report } = await runCapabilityProbe({ ...BASE_OPTS, provider: 'deepseek', model: 'deepseek-flash' });
    expect(report.items.find((i) => i.id === 'context')).toMatchObject({ value: 64_000 });
    modelsFetch = null;
    const other = await runCapabilityProbe({ ...BASE_OPTS, provider: 'deepseek', model: 'not-in-table' });
    expect(other.report.items.find((i) => i.id === 'context')).toMatchObject({ status: 'unknown', reason: 'context_unknown' });
    expect(other.report.items.find((i) => i.id === 'reasoning')?.status).toBe('pass');
  });

  it('并发探测的 5 个请求真的同时在途(不是挨个发)', async () => {
    mode = 'concurrency_timing';
    c5InFlight = 0; c5MaxInFlight = 0;
    const { report } = await runCapabilityProbe(BASE_OPTS);
    expect(c5MaxInFlight).toBe(5);
    expect(report.items.find((i) => i.id === 'concurrency')).toMatchObject({ status: 'pass', value: 5 });
  });

  it('C2、C3 并行发出,耗时各算各的', async () => {
    mode = 'c2_slow';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c2 = report.items.find((i) => i.id === 'roleplay');
    const c3 = report.items.find((i) => i.id === 'format');
    expect(c2?.ms ?? 0).toBeGreaterThanOrEqual(100);
    expect(c3?.ms ?? 999).toBeLessThan(80);
  });

  it('并发里有 429:C5 warn rate_limited_concurrent,且确实同时发出了 5 个请求', async () => {
    mode = 'concurrency_429';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c5 = report.items.find((i) => i.id === 'concurrency');
    expect(c5?.status).toBe('warn');
    expect(c5?.reason).toBe('rate_limited_concurrent');
    // 验证 5 个并发请求都被发出(Promise.all 而不是串行)
    const concurrencyCalls = generatedCalls.filter((c) => String(c.prompt ?? '').includes('只回复数字1'));
    expect(concurrencyCalls.length).toBe(5);
  });

  it('推理型模型(reasoning 字段非空)→ C6 warn reasoning_model', async () => {
    mode = 'reasoning';
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c6 = report.items.find((i) => i.id === 'reasoning');
    expect(c6?.status).toBe('warn');
    expect(c6?.reason).toBe('reasoning_model');
  });

  it('/models 带 context_length → C7 按实际值判断', async () => {
    modelsFetch = async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'test-model', context_length: 128_000 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c7 = report.items.find((i) => i.id === 'context');
    expect(c7?.status).toBe('pass');
    expect(c7?.value).toBe(128_000);
  });

  it('/models 不带 context_length → C7 unknown', async () => {
    modelsFetch = async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'test-model' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const { report } = await runCapabilityProbe(BASE_OPTS);
    const c7 = report.items.find((i) => i.id === 'context');
    expect(c7?.status).toBe('unknown');
  });

  it('返回值里不含 apiKey 原文', async () => {
    const { report, models } = await runCapabilityProbe(BASE_OPTS);
    const json = JSON.stringify({ report, models });
    expect(json).not.toContain('sk-SECRET-KEY-should-not-appear-in-output');
  });

  it('日志里不含 apiKey 原文', async () => {
    await runCapabilityProbe(BASE_OPTS);
    expect(logLines.join('\n')).not.toContain('sk-SECRET-KEY-should-not-appear-in-output');
  });

  it('tts = run 且成功 → C8 pass', async () => {
    ttsOk = true;
    const { report } = await runCapabilityProbe({ ...BASE_OPTS, tts: 'run' });
    const c8 = report.items.find((i) => i.id === 'tts');
    expect(c8?.status).toBe('pass');
  });

  it('tts = run 且失败 → C8 warn tts_failed', async () => {
    ttsOk = false;
    const { report } = await runCapabilityProbe({ ...BASE_OPTS, tts: 'run' });
    const c8 = report.items.find((i) => i.id === 'tts');
    expect(c8?.status).toBe('warn');
    expect(c8?.reason).toBe('tts_failed');
  });

  it('tts = none → C8 skipped', async () => {
    const { report } = await runCapabilityProbe({ ...BASE_OPTS, tts: 'none' });
    const c8 = report.items.find((i) => i.id === 'tts');
    expect(c8?.status).toBe('skipped');
  });
});
