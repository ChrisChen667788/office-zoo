/**
 * v6.169 — 裁了么 HR 回复失败时:访客自己能处理的原因(没配 key / key 被拒 / 欠费 / 限流)
 * 告诉访客真正原因并记 warn;运营方的故障(上游 500 / 超时)照旧记 error、给通用提示。
 * 此前一律记 error、一律回「HR 服务暂时不可用」,托管版里访客 key 被拒会刷屏报警,访客也不知道该去查 key。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let nextReason: string = 'need_key';
vi.mock('../../utils/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/llm')>()),
  callLLMWithTimeout: vi.fn(async () => ({ ok: false, text: '', reason: nextReason, errorMessage: 'upstream said no' })),
}));
const levels: string[] = [];
vi.mock('../../utils/logger', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/logger')>();
  const rec = (level: string) => () => { levels.push(level); };
  const fake = { child: () => fake, info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug'), fatal: rec('fatal') };
  return { ...real, logger: fake };
});

const { firedRouter } = await import('../fired');

const chat = () => firedRouter.request('/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scenarioId: 'probation-fire', personalityId: 'rookie', messages: [{ role: 'user', content: '我不同意' }] }),
});

beforeEach(() => { levels.length = 0; });

describe('裁了么 HR 回复失败', () => {
  it.each([
    ['need_key', /配置你自己的模型 key/],
    ['key_rejected', /key 被模型商拒绝/],
    ['quota', /余额不足/],
    ['rate_limited', /限流/],
  ])('%s → 告诉访客真正原因,记 warn 不记 error', async (reason, msg) => {
    nextReason = reason;
    const res = await chat();
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string; reason: string };
    expect(body.reason).toBe(reason);
    expect(body.error).toMatch(msg);
    expect(body.error).not.toContain('upstream said no');
    expect(levels).toContain('warn');
    expect(levels).not.toContain('error');
  });

  it('运营方故障(上游出错 / 超时)→ 照旧 error + 通用提示', async () => {
    for (const [reason, msg] of [['error', /暂时不可用/], ['timeout', /超时/]] as const) {
      levels.length = 0;
      nextReason = reason;
      const res = await chat();
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(msg);
      expect(levels).toContain('error');
    }
  });
});
