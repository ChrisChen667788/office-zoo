/**
 * v6.169 — 本机 .env 模式的语音链路(MiniMax v2 → MiniMax pro → 青云)报错日志同样打码。
 * MiniMax pro 只在 .env 模式下走到(访客的 MiniMax key 只走 v2),所以单独在这里锁住;
 * 用独立的模块实例,免得「全进程判死」标记影响其它测试。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const ENV_KEY = 'sk-OPERATOR-env-key-0123456789';
const saved = { m: process.env.MINIMAX_API_KEY, q: process.env.QINGYUN_API_KEY, mode: process.env.LLM_KEY_MODE, prof: process.env.DEPLOY_PROFILE };

afterEach(() => {
  for (const [k, v] of [['MINIMAX_API_KEY', saved.m], ['QINGYUN_API_KEY', saved.q], ['LLM_KEY_MODE', saved.mode], ['DEPLOY_PROFILE', saved.prof]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('语音报错日志打码(.env 模式)', () => {
  it('v2 / pro / 青云 三段都失败且上游回显 key → 控制台输出里没有 key', async () => {
    process.env.MINIMAX_API_KEY = ENV_KEY;
    process.env.QINGYUN_API_KEY = ENV_KEY;
    delete process.env.LLM_KEY_MODE;
    delete process.env.DEPLOY_PROFILE;
    vi.resetModules();
    const { generateTTSAudio } = await import('../tts');
    const printed: string[] = [];
    for (const m of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { printed.push(a.map(String).join(' ')); });
    }
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(url);
      const echo = `bad key ${ENV_KEY}`;
      if (url.includes('t2a_pro')) return new Response(JSON.stringify({ base_resp: { status_code: 1008, status_msg: echo } }), { headers: { 'content-type': 'application/json' } });
      if (url.includes('t2a_v2')) return new Response(JSON.stringify({ base_resp: { status_code: 1008, status_msg: echo } }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ error: echo }), { status: 401 });
    });
    expect(await generateTTSAudio('你好', 'villager_cat')).toBeNull();
    expect(seen.some((u) => u.includes('t2a_pro'))).toBe(true); // pro 段确实走到了
    expect(printed.length).toBeGreaterThan(0);
    expect(printed.join('\n')).not.toContain(ENV_KEY);
  });
});
