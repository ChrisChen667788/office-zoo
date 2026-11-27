/**
 * v6.169.5 — /api/llm/check 路由测试:byok / server .env / need_key 三种模式。
 * 安全:返回体里不含任何 key。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BYOK_HEADER, encodeByok, type ByokConfig } from '@furball/shared';

const logs: unknown[] = [];
vi.mock('../../utils/logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/logger')>();
  const fake = {
    child: () => fake,
    info: (...a: unknown[]) => { logs.push(a); },
    warn: (...a: unknown[]) => { logs.push(a); },
    error: (...a: unknown[]) => { logs.push(a); },
    debug: () => {},
    fatal: () => {},
  };
  return { ...real, logger: fake };
});

// mock TTS
vi.mock('../../services/tts', () => ({
  generateTTSAudio: vi.fn(async () => null),
}));

const KEYS = ['DEPLOY_PROFILE', 'LLM_KEY_MODE', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'QINGYUN_API_KEY', 'QINGYUN_BASE_URL', 'MINIMAX_API_KEY'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  logs.length = 0;
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

const ENV_KEY = 'sk-ENV-KEY-0000000000000000';
const USER_KEY = 'sk-USER-KEY-fedcba9876543210';

function cfgByok(apiKey = USER_KEY): ByokConfig {
  return { v: 1, provider: 'deepseek', apiKey, model: 'deepseek-flash' };
}

interface FetchCapture { url: string; auth: string | null; }

function mockFetch(respond: (c: FetchCapture) => Response) {
  const calls: FetchCapture[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get('authorization') });
    return respond({ url, auth: headers.get('authorization') });
  });
  return calls;
}

function chatOk(text = '收到') {
  return new Response(JSON.stringify({
    id: 'x', object: 'chat.completion', created: 1, model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function modelsOk(ids: string[]) {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const { byokMiddleware } = await import('../../utils/byokTransport');
const { llmRoutes } = await import('../../routes/llm');

function makeApp() {
  const app = new Hono();
  app.use('/api/*', byokMiddleware);
  app.route('/api/llm', llmRoutes);
  return app;
}

describe('POST /api/llm/check', () => {
  it('byok 模式:有页面 key — 返回 capability 字段,不含 key', async () => {
    mockFetch((c) =>
      c.url.endsWith('/models')
        ? modelsOk(['deepseek-flash', 'deepseek-v4-pro'])
        : chatOk('收到'),
    );
    const res = await makeApp().request('/api/llm/check', {
      method: 'POST',
      headers: { [BYOK_HEADER]: encodeByok(cfgByok()) },
    });
    const body = await res.text();
    // 不回显 key
    expect(body).not.toContain(USER_KEY);
    const j = JSON.parse(body);
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.source).toBe('byok');
    expect(j.capability).toBeDefined();
    expect(j.capability.v).toBe(1);
    expect(j.capability.items).toBeInstanceOf(Array);
    expect(j.models).toContain('deepseek-flash');
    expect(j.modelListed).toBe(true);
  });

  it('server 模式:没有页面 key,有 .env key — 用 .env 配置跑探针,返回 source=server', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY;
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    mockFetch((c) =>
      c.url.endsWith('/models')
        ? modelsOk(['gpt-4o-mini'])
        : chatOk('收到'),
    );
    const res = await makeApp().request('/api/llm/check', { method: 'POST' });
    const body = await res.text();
    // 返回体里不含 key
    expect(body).not.toContain(ENV_KEY);
    const j = JSON.parse(body);
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.source).toBe('server');
    expect(j.capability).toBeDefined();
    expect(j.model).toBe('gpt-4o-mini');
  });

  it('两者都没有 → need_key', async () => {
    // LLM_KEY_MODE=byok:服务器模式拿不到 .env key
    process.env.DEPLOY_PROFILE = 'hosted';
    const res = await makeApp().request('/api/llm/check', { method: 'POST' });
    expect(res.status).toBe(400);
    const j = await res.json() as { ok: boolean; reason: string };
    expect(j.ok).toBe(false);
    expect(j.reason).toBe('need_key');
  });

  it('server 模式但 .env 没有 key → need_key', async () => {
    // server 模式(本机默认),没有 .env key
    const res = await makeApp().request('/api/llm/check', { method: 'POST' });
    expect(res.status).toBe(400);
    const j = await res.json() as { ok: boolean; reason: string };
    expect(j.ok).toBe(false);
    expect(j.reason).toBe('need_key');
  });

  it('byok key 被拒(C1 fail) → 502 且 ok=false', async () => {
    mockFetch((c) => {
      if (c.url.endsWith('/models')) return modelsOk([]);
      return new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const res = await makeApp().request('/api/llm/check', {
      method: 'POST',
      headers: { [BYOK_HEADER]: encodeByok(cfgByok()) },
    });
    const body = await res.text();
    expect(res.status).toBe(502);
    expect(body).not.toContain(USER_KEY);
    const j = JSON.parse(body);
    expect(j.ok).toBe(false);
    expect(j.reason).toBe('key_rejected');
    expect(j.capability.overall).toBe('incomplete');
  });

  it('页面配置不合法时报 invalid_config,不能悄悄改测服务器 .env 里的模型', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY;
    const calls = mockFetch(() => chatOk('收到'));
    const res = await makeApp().request('/api/llm/check', {
      method: 'POST',
      headers: { [BYOK_HEADER]: 'not-a-valid-config' },
    });
    expect(res.status).toBe(400);
    const j = await res.json() as { ok: boolean; reason: string };
    expect(j).toMatchObject({ ok: false, reason: 'invalid_config' });
    expect(calls).toHaveLength(0);
  });

  it('server 模式的探针用 .env 的地址和 key,且只发往这个地址', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY;
    process.env.OPENAI_BASE_URL = 'https://env-llm.example.com/v1';
    const calls = mockFetch((c) => (c.url.endsWith('/models') ? modelsOk(['gpt-4o-mini']) : chatOk('收到')));
    const res = await makeApp().request('/api/llm/check', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call.url.startsWith('https://env-llm.example.com/v1/')).toBe(true);
      expect(call.auth).toBe(`Bearer ${ENV_KEY}`);
    }
  });
});
