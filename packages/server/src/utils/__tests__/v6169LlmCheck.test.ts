/**
 * v6.169.5 — LLM 工具新行为:
 *   1. kind=CHECK 时不走 MiniMax 兜底(两处路径:空回复 + 报错)
 *   2. 成功和「空内容」两条路径都带上 finishReason / completionTokens / reasoningChars
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 记录日志
const logs: unknown[] = [];
vi.mock('../logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../logger')>();
  const fake = {
    child: () => fake,
    info: (...a: unknown[]) => { logs.push(a); },
    warn: (...a: unknown[]) => { logs.push(a); },
    error: (...a: unknown[]) => { logs.push(a); },
    debug: (...a: unknown[]) => {},
    fatal: (...a: unknown[]) => {},
  };
  return { ...real, logger: fake };
});

const KEYS = ['DEPLOY_PROFILE', 'LLM_KEY_MODE', 'OPENAI_API_KEY', 'MINIMAX_API_KEY', 'QINGYUN_API_KEY'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  // 这些用例测的是主路(.env 的 OpenAI 兼容 key)本身的行为;v6.169.5 起没配主路 key 直接报 need_key、不发请求
  process.env.OPENAI_API_KEY = 'sk-primary-test-key';
  logs.length = 0;
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

function mockFetch(respond: (url: string) => Response) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return respond(url);
  });
  return calls;
}

function chatOk(text = '收到', extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    id: 'x', object: 'chat.completion', created: 1, model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    ...extra,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function chatEmpty() {
  return new Response(JSON.stringify({
    id: 'x', object: 'chat.completion', created: 1, model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content: '   ' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const aiClient = await import('../aiClient');
const { chatModel, runWithAi } = aiClient;
const { callLLMWithTimeout } = await import('../llm');

describe('kind=CHECK 不走 MiniMax 兜底', () => {
  it('server 模式 + MINIMAX_API_KEY 存在 + 主模型返回空:CHECK 不兜底,其他 kind 兜底', async () => {
    process.env.MINIMAX_API_KEY = 'sk-minimax-fallback-key';
    const calls = mockFetch((url) => {
      if (url.includes('minimax')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: '兜底' } }],
          base_resp: { status_code: 0 },
        }), { status: 200 });
      }
      return chatEmpty(); // 主模型空回复
    });

    // CHECK kind:不应该尝试 Minimax
    const checkResult = await callLLMWithTimeout('CHECK', {
      model: chatModel('main', 'gpt-4o-mini'),
      prompt: '只回复两个字:收到',
      maxTokens: 16,
      temperature: 0,
    });
    expect(checkResult.ok).toBe(false);
    expect(checkResult.reason).toBe('empty');
    expect(calls.some((u) => u.includes('minimax'))).toBe(false);

    calls.length = 0;

    // 非 CHECK kind:应该尝试 Minimax
    const speechResult = await callLLMWithTimeout('SPEECH', {
      model: chatModel('main', 'gpt-4o-mini'),
      prompt: '说点什么',
      maxTokens: 60,
      temperature: 0.8,
    });
    expect(speechResult.ok).toBe(true);
    expect(speechResult.text).toBe('兜底');
    expect(calls.some((u) => u.includes('minimax'))).toBe(true);
  });

  it('server 模式 + 主模型报错(500):CHECK 不兜底,其他 kind 兜底', async () => {
    process.env.MINIMAX_API_KEY = 'sk-minimax-fallback-key';
    const calls = mockFetch((url) => {
      if (url.includes('minimax')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: '兜底' } }],
          base_resp: { status_code: 0 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: 'upstream error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    });

    // CHECK kind:不应该尝试 Minimax
    const checkResult = await callLLMWithTimeout('CHECK', {
      model: chatModel('main', 'gpt-4o-mini'),
      prompt: '只回复两个字:收到',
      maxTokens: 16,
      temperature: 0,
      maxRetries: 0,
    });
    expect(checkResult.ok).toBe(false);
    expect(calls.some((u) => u.includes('minimax'))).toBe(false);

    calls.length = 0;

    // 非 CHECK kind:应该尝试 Minimax
    const voteResult = await callLLMWithTimeout('VOTE', {
      model: chatModel('fast', 'gpt-4o-mini'),
      prompt: 'player_1',
      maxTokens: 8,
      temperature: 0,
      maxRetries: 0,
    });
    expect(voteResult.ok).toBe(true);
    expect(calls.some((u) => u.includes('minimax'))).toBe(true);
  });
});

describe('LLMCallResult 携带元数据字段', () => {
  it('成功时带 finishReason / completionTokens', async () => {
    mockFetch(() => chatOk('收到'));
    const r = await callLLMWithTimeout('CHECK', {
      model: chatModel('main', 'gpt-4o-mini'),
      prompt: '只回复两个字:收到',
      maxTokens: 16,
      temperature: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.finishReason).toBe('stop');
    expect(r.completionTokens).toBe(3);
    expect(r.reasoningChars).toBe(0); // 无推理内容
  });

  it('空内容失败时也带元数据', async () => {
    mockFetch(() => chatEmpty());
    // 用访客凭据(CHECK kind + byok):不兜底,直接得到 empty 失败
    const r = await runWithAi(
      { byok: { v: 1, provider: 'deepseek', apiKey: 'sk-test', model: 'deepseek-flash' } },
      () => callLLMWithTimeout('CHECK', {
        model: chatModel('main', 'deepseek-flash'),
        prompt: '只回复两个字:收到',
        maxTokens: 16,
        temperature: 0,
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty');
    expect(r.finishReason).toBe('stop');
    expect(r.completionTokens).toBe(0);
  });
});
