/**
 * v6.163 — 服务端埋点与可观测性回归:
 *  - /api/config 只放可公开的东西;统计配置不合法(非 https / 站点 id 不是 UUID)就当没配
 *  - 模型调用失败:结构化计数进 /api/health,错误摘要里的 key 被打码
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockLanguageModelV1 } from 'ai/test';
import { analyticsConfig, configRoutes } from '../../routes/config';
import { callLLMWithTimeout } from '../llm';
import { llmStatsSnapshot, __resetLlmStatsForTest } from '../llmStats';
import { redactSecrets } from '../redact';

const KEYS = ['UMAMI_SCRIPT_URL', 'UMAMI_WEBSITE_ID', 'DEPLOY_PROFILE', 'MINIMAX_API_KEY'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } __resetLlmStatsForTest(); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const UUID = '3f2a9c1e-1b2c-4d5e-8f90-123456789abc';

describe('analyticsConfig', () => {
  it('没配置 → null(前端不加载任何统计脚本)', () => {
    expect(analyticsConfig()).toEqual({ umami: null });
  });
  it('https 脚本 + UUID 站点 id → 返回', () => {
    process.env.UMAMI_SCRIPT_URL = 'https://umami.example.com/script.js';
    process.env.UMAMI_WEBSITE_ID = UUID;
    expect(analyticsConfig()).toEqual({ umami: { scriptUrl: 'https://umami.example.com/script.js', websiteId: UUID } });
  });
  it('http 外站 / javascript: / 站点 id 非 UUID → 当没配', () => {
    process.env.UMAMI_WEBSITE_ID = UUID;
    process.env.UMAMI_SCRIPT_URL = 'http://umami.example.com/script.js';
    expect(analyticsConfig().umami).toBeNull();
    process.env.UMAMI_SCRIPT_URL = 'javascript:alert(1)';
    expect(analyticsConfig().umami).toBeNull();
    process.env.UMAMI_SCRIPT_URL = 'https://umami.example.com/script.js';
    process.env.UMAMI_WEBSITE_ID = 'not-a-uuid';
    expect(analyticsConfig().umami).toBeNull();
  });
  it('本机 http 允许(自己起 Umami 调试)', () => {
    process.env.UMAMI_SCRIPT_URL = 'http://localhost:3300/script.js';
    process.env.UMAMI_WEBSITE_ID = UUID;
    expect(analyticsConfig().umami?.scriptUrl).toBe('http://localhost:3300/script.js');
  });
});

describe('GET /api/config', () => {
  it('只含 profile 与 analytics,不缓存', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const res = await configRoutes.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const j = await res.json() as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(['analytics', 'profile']);
    expect(j.profile).toBe('hosted');
  });
});

describe('redactSecrets', () => {
  it('打码常见 key 形态,不误伤普通中文与短词', () => {
    const s = redactSecrets('Incorrect API key provided: sk-proj-AbCdEf0123456789xyz. Bearer abcdefghijklmnop123 普通文本 ok');
    expect(s).not.toContain('AbCdEf0123456789xyz');
    expect(s).not.toContain('abcdefghijklmnop123');
    expect(s).toContain('普通文本 ok');
    expect(redactSecrets('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N')).not.toContain('dozjgNryP4J3jVmNHl0w5N');
  });
});

describe('callLLMWithTimeout 失败路径', () => {
  it('上游报错:返回 ok:false + 打码后的错误;计入 /api/health 统计', async () => {
    const model = new MockLanguageModelV1({
      doGenerate: async () => { throw new Error('401 Incorrect API key provided: sk-live-SECRETSECRET1234567890'); },
    });
    const r = await callLLMWithTimeout('SPEECH', { model, prompt: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('error');
    expect(r.errorMessage).not.toContain('SECRETSECRET1234567890');
    const snap = llmStatsSnapshot();
    expect(snap.calls).toBe(1);
    expect(snap.failed.error).toBe(1);
    expect(snap.byKind.SPEECH).toEqual({ calls: 1, failed: 1 });
  });

  it('成功调用计入 ok;空回复计入 empty', async () => {
    const good = new MockLanguageModelV1({
      doGenerate: async () => ({ rawCall: { rawPrompt: null, rawSettings: {} }, finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, text: '收到' }),
    });
    const empty = new MockLanguageModelV1({
      doGenerate: async () => ({ rawCall: { rawPrompt: null, rawSettings: {} }, finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 0 }, text: '  ' }),
    });
    expect((await callLLMWithTimeout('VOTE', { model: good, prompt: 'x' })).ok).toBe(true);
    expect((await callLLMWithTimeout('VOTE', { model: empty, prompt: 'x' })).reason).toBe('empty');
    const snap = llmStatsSnapshot();
    expect(snap.ok).toBe(1);
    expect(snap.failed.empty).toBe(1);
    expect(snap.failRate).toBe(0.5);
  });
});
