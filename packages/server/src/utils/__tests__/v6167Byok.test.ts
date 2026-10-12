/**
 * v6.167 — BYOK 服务端安全回归。所有对外请求都被 mock 截住(不会真的联网)。
 *
 *  1. hosted / byok 模式:环境变量里放了运营方 key 也绝不使用;没配凭据 → need_key,且不发任何请求
 *  2. 访客凭据:请求打到访客选的模型商、带访客自己的 key;两个访客并发互不串号
 *  3. 访客的 key 失败:不走 .env 的 MiniMax 兜底;401 → key_rejected 并通知对局
 *  4. temperature 按模型商上限截断
 *  5. HTTP 中间件:X-Byok 解析、X-Byok-Error / X-Llm-Error 回头;日志与响应里没有 key
 *  6. 自定义 base URL:托管默认关闭;打开后拒绝内网 / 回环 / 云元数据地址
 *  7. 语音:访客选浏览器朗读 → 不发请求;选模型商语音 → 用访客的 key;访客失败不触发全局判死
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BYOK_HEADER, encodeByok, type ByokConfig } from '@furball/shared';

const logs: unknown[] = [];
vi.mock('../logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../logger')>();
  const rec = (level: string) => (...args: unknown[]) => { logs.push([level, ...args]); };
  const fake = { child: () => fake, info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug'), fatal: rec('fatal') };
  return { ...real, logger: fake };
});

const { callLLMWithTimeout } = await import('../llm');
const aiClient = await import('../aiClient');
const { chatModel, runWithAi, keyMode, checkCustomBaseUrl, isPrivateAddress, __clearBaseUrlCacheForTest } = aiClient;
const { byokMiddleware } = await import('../byokTransport');
const { generateTTSAudio } = await import('../../services/tts');
const { llmRoutes } = await import('../../routes/llm');

const KEYS = ['DEPLOY_PROFILE', 'LLM_KEY_MODE', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'QINGYUN_API_KEY', 'MINIMAX_API_KEY', 'BYOK_ALLOW_CUSTOM_BASE_URL'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  logs.length = 0;
  __clearBaseUrlCacheForTest();
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

const ENV_KEY = 'sk-OPERATOR-env-key-0000000000';
const USER_A = 'sk-userA-0123456789abcdef';
const USER_B = 'sk-userB-fedcba9876543210';
const cfg = (apiKey: string, over: Partial<ByokConfig> = {}): ByokConfig => ({ v: 1, provider: 'deepseek', apiKey, model: 'deepseek-flash', ...over });

interface Captured { url: string; auth: string | null; body: Record<string, unknown> | null }
function mockFetch(respond: (c: Captured) => Response) {
  const calls: Captured[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    let body: Record<string, unknown> | null = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
    const c = { url, auth: headers.get('authorization'), body };
    calls.push(c);
    return respond(c);
  });
  return calls;
}
const chatOk = (text = '收到') => new Response(JSON.stringify({
  id: 'x', object: 'chat.completion', created: 1, model: 'm',
  choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('key 模式', () => {
  it('默认:local → server,hosted → byok;LLM_KEY_MODE 可覆盖', () => {
    expect(keyMode()).toBe('server');
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(keyMode()).toBe('byok');
    process.env.LLM_KEY_MODE = 'server';
    expect(keyMode()).toBe('server');
  });
});

describe('托管版绝不使用运营方 key', () => {
  it('hosted + 环境变量里有 key + 访客没配 → need_key,一个请求都不发', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    process.env.OPENAI_API_KEY = ENV_KEY;
    process.env.MINIMAX_API_KEY = ENV_KEY;
    const calls = mockFetch(() => chatOk());
    const r = await runWithAi({ byok: null }, () => callLLMWithTimeout('SPEECH', { model: chatModel('main', 'gpt-4o-mini'), prompt: 'hi' }));
    expect(r).toMatchObject({ ok: false, reason: 'need_key' });
    expect(calls).toHaveLength(0);
  });

  it('上下文之外(没有任何请求 / 对局上下文)同样 need_key', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    process.env.OPENAI_API_KEY = ENV_KEY;
    const calls = mockFetch(() => chatOk());
    const r = await callLLMWithTimeout('VOTE', { model: chatModel('fast', 'gpt-4o-mini'), prompt: 'x' });
    expect(r.reason).toBe('need_key');
    expect(calls).toHaveLength(0);
  });
});

describe('访客凭据', () => {
  it('请求打到访客选的模型商、带访客自己的 key、用访客选的模型', async () => {
    process.env.OPENAI_API_KEY = ENV_KEY; // 本机也有 .env:访客配了 key 时优先访客的
    const calls = mockFetch(() => chatOk('好的'));
    const r = await runWithAi({ byok: cfg(USER_A) }, () => callLLMWithTimeout('SPEECH', { model: chatModel('main', 'gpt-4o-mini'), prompt: 'hi' }));
    expect(r).toEqual({ ok: true, text: '好的' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.deepseek.com/chat/completions');
    expect(calls[0].auth).toBe(`Bearer ${USER_A}`);
    expect(calls[0].body?.model).toBe('deepseek-flash');
    expect(JSON.stringify(calls)).not.toContain(ENV_KEY);
  });

  it('fast 档用 fastModel', async () => {
    const calls = mockFetch(() => chatOk());
    await runWithAi({ byok: cfg(USER_A, { fastModel: 'cheap-one' }) }, () => callLLMWithTimeout('VOTE', { model: chatModel('fast', 'x'), prompt: 'v' }));
    expect(calls[0].body?.model).toBe('cheap-one');
  });

  it('两个访客并发:各用各的 key,不串号', async () => {
    const calls = mockFetch((c) => {
      const prompt = JSON.stringify(c.body);
      return chatOk(prompt.includes('A的话') ? 'A' : 'B');
    });
    const run = (key: string, tag: string) => runWithAi({ byok: cfg(key) }, async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      return callLLMWithTimeout('SPEECH', { model: chatModel('main', 'x'), prompt: tag });
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? run(USER_A, 'A的话') : run(USER_B, 'B的话'))));
    for (const c of calls) {
      const fromA = JSON.stringify(c.body).includes('A的话');
      expect(c.auth).toBe(`Bearer ${fromA ? USER_A : USER_B}`);
    }
    expect(calls).toHaveLength(10);
  });

  it('上下文结束后不残留:之后的调用看不到上一个访客的 key', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    mockFetch(() => chatOk());
    await runWithAi({ byok: cfg(USER_A) }, async () => { /* noop */ });
    expect(aiClient.currentByok()).toBeNull();
  });
});

describe('失败处理', () => {
  it('访客 key 被拒(401)→ key_rejected、通知对局;不走 .env 的 MiniMax 兜底', async () => {
    process.env.MINIMAX_API_KEY = ENV_KEY;
    const calls = mockFetch((c) => (c.url.includes('deepseek')
      ? new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${USER_A}` } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      : chatOk('兜底')));
    const onFailure = vi.fn();
    const r = await runWithAi({ byok: cfg(USER_A), onFailure }, () => callLLMWithTimeout('SPEECH', { model: chatModel('main', 'x'), prompt: 'hi' }));
    expect(r.reason).toBe('key_rejected');
    expect(r.errorMessage).not.toContain(USER_A);
    expect(onFailure).toHaveBeenCalledWith('key_rejected');
    expect(calls.some((c) => c.url.includes('minimax'))).toBe(false);
    expect(JSON.stringify(logs)).not.toContain(USER_A);
  });

  it('访客的模型商 500 / 空回复(非访客可处理的失败)→ 同样不动用 .env 的 MiniMax key', async () => {
    process.env.MINIMAX_API_KEY = ENV_KEY;
    for (const resp of [
      () => new Response('{"error":{"message":"upstream boom"}}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      () => chatOk('   '),
    ]) {
      const calls = mockFetch((c) => (c.url.includes('deepseek') ? resp() : chatOk('运营方兜底')));
      const r = await runWithAi({ byok: cfg(USER_A) }, () => callLLMWithTimeout('VOTE', { model: chatModel('fast', 'x'), prompt: 'v', maxRetries: 0 }));
      expect(r.ok).toBe(false);
      expect(calls.some((c) => c.url.includes('minimax'))).toBe(false);
      expect(JSON.stringify(calls)).not.toContain(ENV_KEY);
      vi.restoreAllMocks();
    }
  });

  it('本机 .env 模式(没有访客凭据)兜底照旧可用', async () => {
    process.env.MINIMAX_API_KEY = ENV_KEY;
    const calls = mockFetch((c) => (c.url.includes('minimax')
      ? new Response(JSON.stringify({ choices: [{ message: { content: '运营方兜底' } }], base_resp: { status_code: 0 } }), { status: 200 })
      : new Response('{"error":{"message":"boom"}}', { status: 500, headers: { 'Content-Type': 'application/json' } })));
    const r = await callLLMWithTimeout('VOTE', { model: chatModel('fast', 'gpt-4o-mini'), prompt: 'v', maxRetries: 0 });
    expect(r).toEqual({ ok: true, text: '运营方兜底' });
    expect(calls.some((c) => c.url.includes('minimax') && c.auth === `Bearer ${ENV_KEY}`)).toBe(true);
  });

  it('402 → quota;429 → rate_limited', async () => {
    for (const [status, reason] of [[402, 'quota'], [429, 'rate_limited']] as const) {
      mockFetch(() => new Response('{"error":{"message":"x"}}', { status, headers: { 'Content-Type': 'application/json' } }));
      const r = await runWithAi({ byok: cfg(USER_A) }, () => callLLMWithTimeout('VOTE', { model: chatModel('fast', 'x'), prompt: 'v', maxRetries: 0 }));
      expect(r.reason).toBe(reason);
      vi.restoreAllMocks();
    }
  });

  it('temperature 按模型商上限截断(Moonshot 只接受 ≤ 1)', async () => {
    const calls = mockFetch(() => chatOk());
    await runWithAi({ byok: cfg(USER_A, { provider: 'moonshot', model: 'kimi-k2.6' }) }, () =>
      callLLMWithTimeout('SPEECH', { model: chatModel('main', 'x'), prompt: 'hi', temperature: 1.3 }));
    expect(calls[0].url).toBe('https://api.moonshot.cn/v1/chat/completions');
    expect(calls[0].body?.temperature).toBe(1);
  });
});

describe('HTTP 中间件', () => {
  function app() {
    const a = new Hono();
    a.use('/api/*', byokMiddleware);
    a.post('/api/talk', async (c) => {
      const r = await callLLMWithTimeout('SPEECH', { model: chatModel('main', 'x'), prompt: 'hi' });
      return c.json({ ok: r.ok, text: r.ok ? r.text : '(兜底台词)' });
    });
    a.route('/api/llm', llmRoutes);
    return a;
  }

  it('带合法 X-Byok:用访客的 key;响应不回显 key', async () => {
    const calls = mockFetch(() => chatOk('收到'));
    const res = await app().request('/api/talk', { method: 'POST', headers: { [BYOK_HEADER]: encodeByok(cfg(USER_A)) } });
    expect(await res.json()).toEqual({ ok: true, text: '收到' });
    expect(calls[0].auth).toBe(`Bearer ${USER_A}`);
    expect(res.headers.get('X-Llm-Error')).toBeNull();
  });

  it('hosted 没配 → 路由照常兜底,但响应带 X-Llm-Error: need_key', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    process.env.OPENAI_API_KEY = ENV_KEY;
    const calls = mockFetch(() => chatOk());
    const res = await app().request('/api/talk', { method: 'POST' });
    expect(await res.json()).toEqual({ ok: false, text: '(兜底台词)' });
    expect(res.headers.get('X-Llm-Error')).toBe('need_key');
    expect(calls).toHaveLength(0);
  });

  it('非法 X-Byok → 当没配,并回 X-Byok-Error', async () => {
    mockFetch(() => chatOk());
    const res = await app().request('/api/talk', { method: 'POST', headers: { [BYOK_HEADER]: 'garbage!!' } });
    expect(res.headers.get('X-Byok-Error')).toBe('invalid_byok');
  });

  it('/api/llm/check:成功时给模型列表与耗时,绝不回显 key;没配 → 400 need_key', async () => {
    mockFetch((c) => (c.url.endsWith('/models')
      ? new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }, { id: 'bad id!' }] }), { status: 200 })
      : chatOk('收到')));
    const res = await app().request('/api/llm/check', { method: 'POST', headers: { [BYOK_HEADER]: encodeByok(cfg(USER_A)) } });
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain(USER_A);
    const j = JSON.parse(body);
    expect(j).toMatchObject({ ok: true, provider: 'deepseek', model: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro'], modelListed: true, tts: 'browser' });
    const none = await app().request('/api/llm/check', { method: 'POST' });
    expect(none.status).toBe(400);
    expect(await none.json()).toMatchObject({ ok: false, reason: 'need_key' });
  });
});

describe('自定义 base URL(SSRF)', () => {
  const fakeLookup = (addr: string) => (async () => [{ address: addr, family: addr.includes(':') ? 6 : 4 }]) as never;

  it('内网 / 回环 / 链路本地(云元数据)/ CGNAT / IPv6 私有 一律判不安全', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('托管默认关闭;打开后:必须 https、不能是 IP / localhost、解析到内网拒绝', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(await checkCustomBaseUrl('https://llm.example.com/v1', fakeLookup('1.1.1.1'))).toEqual({ ok: false, reason: 'custom_base_url_disabled' });
    process.env.BYOK_ALLOW_CUSTOM_BASE_URL = '1';
    expect(await checkCustomBaseUrl('http://llm.example.com/v1', fakeLookup('1.1.1.1'))).toEqual({ ok: false, reason: 'https_required' });
    expect(await checkCustomBaseUrl('https://169.254.169.254/latest', fakeLookup('169.254.169.254'))).toEqual({ ok: false, reason: 'host_not_allowed' });
    expect(await checkCustomBaseUrl('https://localhost/v1', fakeLookup('127.0.0.1'))).toEqual({ ok: false, reason: 'host_not_allowed' });
    expect(await checkCustomBaseUrl('https://rebind.example.com/v1', fakeLookup('10.0.0.5'))).toEqual({ ok: false, reason: 'resolves_to_private_address' });
    expect(await checkCustomBaseUrl('https://llm.example.com/v1', fakeLookup('1.1.1.1'))).toEqual({ ok: true });
  });

  it('解析结果里只要混有一个内网地址就拒绝(防「一公一私」绕过)', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    process.env.BYOK_ALLOW_CUSTOM_BASE_URL = '1';
    const mixed = (async () => [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.7', family: 4 }]) as never;
    expect(await checkCustomBaseUrl('https://mixed.example.com/v1', mixed)).toEqual({ ok: false, reason: 'resolves_to_private_address' });
    const empty = (async () => []) as never;
    expect(await checkCustomBaseUrl('https://empty.example.com/v1', empty)).toEqual({ ok: false, reason: 'resolves_to_private_address' });
  });
});

describe('语音', () => {
  it('访客选浏览器朗读(默认)→ 返回 null,不发请求;托管没配同样不发', async () => {
    process.env.MINIMAX_API_KEY = ENV_KEY;
    const calls = mockFetch(() => new Response(new Uint8Array(500)));
    expect(await runWithAi({ byok: cfg(USER_A) }, () => generateTTSAudio('你好', 'villager_cat'))).toBeNull();
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(await runWithAi({ byok: null }, () => generateTTSAudio('你好', 'villager_cat'))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('访客选模型商语音 → 用访客的 key 打访客的模型商;失败不触发全局判死', async () => {
    const audio = new Uint8Array(400).fill(7);
    let fail = true;
    const calls = mockFetch((c) => {
      if (c.url.includes('siliconflow')) {
        return fail ? new Response('{"message":"invalid key"}', { status: 401 }) : new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
      }
      return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
    });
    const sf = cfg(USER_A, { provider: 'siliconflow', model: 'Qwen/Qwen3-8B', tts: { mode: 'provider' } });
    expect(await runWithAi({ byok: sf }, () => generateTTSAudio('你好', 'villager_cat'))).toBeNull();
    expect(calls[0].url).toBe('https://api.siliconflow.cn/v1/audio/speech');
    expect(calls[0].auth).toBe(`Bearer ${USER_A}`);
    expect(calls[0].body?.voice).toBe('FunAudioLLM/CosyVoice2-0.5B:anna'); // villager_cat 是女声(nova)
    fail = false;
    const buf = await runWithAi({ byok: sf }, () => generateTTSAudio('你好', 'killer_dog'));
    expect(buf?.length).toBe(400);
    expect(calls[1].body?.voice).toBe('FunAudioLLM/CosyVoice2-0.5B:alex');
    // 访客的 401 之后,本机 .env 的语音链路仍然会被尝试(没有被全局判死)
    process.env.QINGYUN_API_KEY = ENV_KEY;
    calls.length = 0;
    await generateTTSAudio('你好', 'villager_cat');
    expect(calls.some((c) => c.auth === `Bearer ${ENV_KEY}`)).toBe(true);
  });
});
