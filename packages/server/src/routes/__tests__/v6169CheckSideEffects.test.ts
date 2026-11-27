/**
 * v6.169.5 — /api/llm/check 的副作用与限流,以及本机模式没配 key 时的行为。
 *  1. 检测里的失败只写进检测结果,不再经 X-Llm-Error 响应头让页面弹「AI 正在用兜底台词」
 *  2. 用服务器 .env key 的检测另外限流(每个来源 10 分钟 3 次),页面 key 的检测不受影响
 *  3. 本机模式 .env 没配 key:报 need_key,不再拿空令牌请求第三方
 * 所有出站请求都被 mock 截住。每个用例用不同的来源 IP,互不占用限流额度。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BYOK_HEADER, encodeByok, type ByokConfig } from '@furball/shared';

vi.mock('../../utils/logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/logger')>();
  const fake = { child: () => fake, info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {} };
  return { ...real, logger: fake };
});
vi.mock('../../services/tts', () => ({ generateTTSAudio: vi.fn(async () => null) }));

const KEYS = ['DEPLOY_PROFILE', 'LLM_KEY_MODE', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'QINGYUN_API_KEY', 'QINGYUN_BASE_URL', 'MINIMAX_API_KEY', 'TRUST_PROXY_HOPS'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.TRUST_PROXY_HOPS = '1'; // 用 X-Forwarded-For 区分来源
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

const ENV_KEY = 'sk-ENV-KEY-side-effects-000';
const cfg: ByokConfig = { v: 1, provider: 'deepseek', apiKey: 'sk-USER-side-effects-111', model: 'deepseek-flash' };

function mockFetch(respond: (url: string) => Response) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return respond(url);
  });
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const chat = (content: string) => json({
  id: 'x', object: 'chat.completion', created: 1, model: 'm',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
});

const { byokMiddleware } = await import('../../utils/byokTransport');
const { llmRoutes } = await import('../llm');
const { callLLMWithTimeout } = await import('../../utils/llm');
const { chatModel, runWithAi } = await import('../../utils/aiClient');
const { safeErrorText } = await import('../../utils/redact');

function app() {
  const a = new Hono();
  a.use('/api/*', byokMiddleware);
  a.route('/api/llm', llmRoutes);
  return a;
}
const post = (ip: string, headers: Record<string, string> = {}) =>
  app().request('/api/llm/check', { method: 'POST', headers: { 'x-forwarded-for': ip, ...headers } });

describe('检测不再触发「AI 正在用兜底台词」提示', () => {
  it('页面 key 被拒:结果里写明 key_rejected,响应头没有 X-Llm-Error', async () => {
    mockFetch((url) => (url.endsWith('/models') ? json({ error: { message: 'bad key' } }, 401) : json({ error: { message: 'bad key' } }, 401)));
    const res = await post('10.0.0.1', { [BYOK_HEADER]: encodeByok(cfg) });
    expect(res.status).toBe(502);
    expect((await res.json() as { reason: string }).reason).toBe('key_rejected');
    expect(res.headers.get('X-Llm-Error')).toBeNull();
  });

  it('服务器 key 的检测里有限流:响应头同样没有 X-Llm-Error', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY;
    let n = 0;
    mockFetch((url) => (url.endsWith('/models') ? json({ data: [] }) : (++n > 3 ? json({ error: { message: 'slow down' } }, 429) : chat('收到'))));
    const res = await post('10.0.0.2');
    expect(res.status).toBe(200);
    const body = await res.json() as { capability: { items: Array<{ id: string; reason?: string }> } };
    expect(body.capability.items.find((i) => i.id === 'concurrency')?.reason).toBe('rate_limited_concurrent');
    expect(res.headers.get('X-Llm-Error')).toBeNull();
  });
});

describe('用服务器 key 的检测另外限流', () => {
  it('同一来源 10 分钟内第 4 次被拦,页面 key 的检测不受影响', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY;
    const calls = mockFetch((url) => (url.endsWith('/models') ? json({ data: [] }) : chat('收到')));
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await post('10.0.0.3')).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const before = calls.length;
    const blocked = await post('10.0.0.3');
    expect(blocked.status).toBe(429);
    expect(calls.length).toBe(before); // 被拦时一次模型请求都没发
    expect((await post('10.0.0.3', { [BYOK_HEADER]: encodeByok(cfg) })).status).toBe(200);
    expect((await post('10.0.0.4')).status).toBe(200); // 别的来源不受影响
  });
});

describe('本机模式 .env 没配 key', () => {
  it('报 need_key,不发任何请求(以前会拿空令牌请求第三方,再被拒成 key_rejected)', async () => {
    const calls = mockFetch(() => chat('不该被调用'));
    const r = await runWithAi({ byok: null }, () => callLLMWithTimeout('SPEECH', { model: chatModel('main', 'gpt-4o-mini'), prompt: 'hi' }));
    expect(r).toMatchObject({ ok: false, reason: 'need_key' });
    expect(calls).toHaveLength(0);
  });

  it('配了 key 照常请求 .env 的地址(对照)', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY;
    process.env.OPENAI_BASE_URL = 'https://env-llm.example.com/v1';
    const calls = mockFetch(() => chat('好的'));
    const r = await runWithAi({ byok: null }, () => callLLMWithTimeout('SPEECH', { model: chatModel('main', 'gpt-4o-mini'), prompt: 'hi' }));
    expect(r).toMatchObject({ ok: true, text: '好的' });
    expect(calls[0]).toBe('https://env-llm.example.com/v1/chat/completions');
  });
});

describe('服务器 .env 的 key 也逐字打码', () => {
  it('不带常见前缀的 key(如 UUID 式)出现在错误信息里也会被抹掉;不在请求上下文里也一样', async () => {
    const uuidKey = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
    process.env.OPENAI_API_KEY = uuidKey;
    const msg = `Incorrect API key provided: ${uuidKey}`;
    expect(safeErrorText(new Error(msg), 500)).not.toContain(uuidKey);
    const inCtx = await runWithAi({ byok: null }, async () => safeErrorText(new Error(msg), 500));
    expect(inCtx).not.toContain(uuidKey);
    delete process.env.OPENAI_API_KEY;
    expect(safeErrorText(new Error(msg), 500)).toContain(uuidKey); // 对照:没登记的串照原样(说明上面是逐字替换生效)
  });
});
