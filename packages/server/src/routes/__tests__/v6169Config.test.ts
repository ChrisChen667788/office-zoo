/**
 * v6.169.5 — /api/config 增加 llm.serverKeyConfigured。
 *
 * 安全:serverKeyConfigured 只返回布尔值,即使 key 存在,返回体里也找不到 key 字符串。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEYS = ['DEPLOY_PROFILE', 'LLM_KEY_MODE', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'QINGYUN_API_KEY', 'MINIMAX_API_KEY', 'UMAMI_SCRIPT_URL', 'UMAMI_WEBSITE_ID'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

const { configRoutes } = await import('../config');

describe('GET /api/config — llm.serverKeyConfigured', () => {
  it('没有任何 key → serverKeyConfigured = false', async () => {
    const res = await configRoutes.request('/');
    expect(res.status).toBe(200);
    const j = await res.json() as { llm: { serverKeyConfigured: boolean } };
    expect(j.llm.serverKeyConfigured).toBe(false);
  });

  it('OPENAI_API_KEY 存在 → serverKeyConfigured = true', async () => {
    process.env.OPENAI_API_KEY = 'sk-REAL-KEY-should-not-be-in-body';
    const res = await configRoutes.request('/');
    const body = await res.text();
    // 不回显 key
    expect(body).not.toContain('sk-REAL-KEY-should-not-be-in-body');
    const j = JSON.parse(body) as { llm: { serverKeyConfigured: boolean } };
    expect(j.llm.serverKeyConfigured).toBe(true);
  });

  it('QINGYUN_API_KEY 存在 → serverKeyConfigured = true', async () => {
    process.env.QINGYUN_API_KEY = 'qy-REAL-KEY-should-not-be-in-body';
    const res = await configRoutes.request('/');
    const body = await res.text();
    expect(body).not.toContain('qy-REAL-KEY-should-not-be-in-body');
    const j = JSON.parse(body) as { llm: { serverKeyConfigured: boolean } };
    expect(j.llm.serverKeyConfigured).toBe(true);
  });

  it('返回体是布尔值,不含任何密钥片段', async () => {
    const secretKey = 'sk-SECRET-PARTIAL-KEY-abc123';
    process.env.OPENAI_API_KEY = secretKey;
    const res = await configRoutes.request('/');
    const body = await res.text();
    expect(body).not.toContain(secretKey);
    // serverKeyConfigured 是布尔值
    const j = JSON.parse(body) as { llm: { serverKeyConfigured: unknown } };
    expect(typeof j.llm.serverKeyConfigured).toBe('boolean');
  });

  it('本机 .env 配了 key 时给出模型名(前端用它对上检测缓存);没配 key 或托管版不给', async () => {
    process.env.OPENAI_API_KEY = 'sk-model-name-test';
    process.env.OPENAI_MODEL = 'deepseek-chat';
    let j = await (await configRoutes.request('/')).json() as { llm: { serverModel?: string } };
    expect(j.llm.serverModel).toBe('deepseek-chat');

    delete process.env.OPENAI_API_KEY;
    j = await (await configRoutes.request('/')).json() as { llm: { serverModel?: string } };
    expect(j.llm.serverModel).toBeUndefined();

    process.env.OPENAI_API_KEY = 'sk-model-name-test';
    process.env.DEPLOY_PROFILE = 'hosted';
    j = await (await configRoutes.request('/')).json() as { llm: { serverModel?: string } };
    expect(j.llm.serverModel).toBeUndefined();
  });

  it('只配了 MiniMax 备路:算有模型(不显示「未配置」),但没有可检测的主路模型名', async () => {
    process.env.MINIMAX_API_KEY = 'mm-only-key-should-not-be-in-body';
    const res = await configRoutes.request('/');
    const body = await res.text();
    expect(body).not.toContain('mm-only-key-should-not-be-in-body');
    const j = JSON.parse(body) as { llm: { serverKeyConfigured: boolean; serverModel?: string } };
    expect(j.llm.serverKeyConfigured).toBe(true);
    expect(j.llm.serverModel).toBeUndefined();
  });
});
