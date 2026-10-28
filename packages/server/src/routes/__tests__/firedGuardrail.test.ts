/**
 * v6.164 — 裁了么的提示词护栏真的进了发给模型的提示词。
 *
 * 不在测试里复刻拼接逻辑:mock 掉 callLLMWithTimeout,直接请求真实路由(/chat、/suggest),
 * 抓下发给模型的 system / prompt 断言。防的是「护栏常量写了,但某条路径没拼进去」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ kind: string; system?: string; prompt?: string }> = [];
vi.mock('../../utils/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/llm')>()),
  callLLMWithTimeout: vi.fn(async (kind: string, opts: { system?: string; prompt?: string }) => {
    calls.push({ kind, system: opts.system, prompt: opts.prompt });
    if (kind === 'SUGGESTIONS') return { ok: true, text: '[{"text":"a","style":"calm"}]' };
    if (kind === 'SCORING') return { ok: true, text: '{"scores":{"legalKnowledge":50,"negotiationSkill":50,"emotionalControl":50,"evidenceAwareness":50},"lawyerTip":null,"keyMoment":null,"isOver":false,"outcome":null}' };
    return { ok: true, text: '我们公司也很为难。' };
  }),
}));
vi.mock('../../services/scenarioStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/scenarioStore')>()),
  listUserScenarios: async () => [],
}));

const { firedRouter } = await import('../fired');
const { HR_ROLEPLAY_GUARDRAIL, LEGAL_ADVISOR_GUARDRAIL } = await import('../../services/legalGuardrail');

const post = (path: string, body: unknown) => firedRouter.request(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => { calls.length = 0; });

describe('裁了么提示词护栏(v6.164)', () => {
  it('HR 回复的 system 带角色扮演护栏;评分(律师提示 / 点评)的 prompt 带法律护栏', async () => {
    const res = await post('/chat', {
      scenarioId: 'verbal-fire-no-paper',
      personalityId: 'veteran',
      messages: [{ role: 'hr', content: '你明天不用来了。' }, { role: 'user', content: '请出示书面通知。' }],
    });
    expect(res.status).toBe(200);
    const hr = calls.find((c) => c.kind === 'CHAT_REPLY');
    expect(hr?.system).toContain(HR_ROLEPLAY_GUARDRAIL);
    const scoring = calls.find((c) => c.kind === 'SCORING');
    expect(scoring?.prompt).toContain(LEGAL_ADVISOR_GUARDRAIL);
  });

  it('回复建议的 system 带法律护栏', async () => {
    const res = await post('/suggest', {
      scenarioId: 'verbal-fire-no-paper',
      messages: [{ role: 'hr', content: '你明天不用来了。' }],
    });
    expect(res.status).toBe(200);
    const sug = calls.find((c) => c.kind === 'SUGGESTIONS');
    expect(sug?.system).toContain(LEGAL_ADVISOR_GUARDRAIL);
  });

  it('护栏文本本身:禁止行动指令与结果承诺,指向律师 / 仲裁机构', () => {
    expect(LEGAL_ADVISOR_GUARDRAIL).toContain('不构成法律意见');
    expect(LEGAL_ADVISOR_GUARDRAIL).toMatch(/不要替用户.*具体行动决定或结果承诺/);
    expect(LEGAL_ADVISOR_GUARDRAIL).toContain('劳动争议仲裁机构');
  });
});
