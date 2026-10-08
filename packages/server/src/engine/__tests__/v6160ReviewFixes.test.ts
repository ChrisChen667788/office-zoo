/**
 * v6.160 — 补审(engine / locale 维度)确认问题的回归测试。
 *
 * 引擎:超时代打记「已发言」/ 讨论中途占座的提交明确拒绝 / AI 波次进行中 destroy 不再挂 4 分钟。
 * 语言:外语局 prompt 不混进中文 —— 嘉宾署名、事件描述、公司包记忆、金句池预置。
 * 每条都正反两侧验:外语局不再注入中文,中文局行为不变。
 */
import { describe, it, expect, vi } from 'vitest';
import { GamePhase, formatHumanSpeechForPrompt, type GameEvent } from '@furball/shared';

vi.mock('../../routes/hotQuotes', () => ({
  getRecentHotQuoteTexts: async () => ['老板画的饼比工位还大'],
}));
vi.mock('../../services/packMemoryStore', () => ({
  listPackMemories: async () => [
    { ts: 1, winnerLabel: '打工人', survivors: ['Alice'], eliminated: ['Bob'], roster: ['Alice', 'Bob'] },
  ],
  recordPackGame: async () => {},
}));

import { GameEngine, buildDiscussionContextFn } from '../GameEngine';

const HAN = /[㐀-鿿]/;

type Inner = {
  agents: Map<string, { generateSpeech: (...a: unknown[]) => Promise<string>; generateVote: (...a: unknown[]) => Promise<string> }>;
  runDiscussion: () => Promise<void>;
  precommittedSpeeches: Map<string, string>;
  spokenThisRound: Set<string>;
  discussionResolver?: () => void;
  humanSpeeches: string[];
  leakedHints: string[];
  buildDiscussionContext: () => string;
  seedHotQuoteHints: () => Promise<void>;
  loadPackMemorySnippets: (packId: string, names: string[]) => Promise<Record<string, string>>;
  state: { phase: string; players: Array<{ id: string; isAlive: boolean; name: string }> };
};
const inner = (e: GameEngine) => e as unknown as Inner;

function engine(locale?: 'zh' | 'en'): GameEngine {
  const e = new GameEngine(locale ? { playerCount: 8, locale } : 8);
  e.createPlayers();
  return e;
}

function stubAgents(e: GameEngine, speech: () => Promise<string> = async () => 'stub') {
  for (const [id] of inner(e).agents) {
    inner(e).agents.set(id, { generateSpeech: speech, generateVote: async () => 'skip' });
  }
}

describe('v6.160 引擎 — 真人席位时序', () => {
  it('发言超时由 AI 代打后,这一席本轮算已发言:迟到提交被拒且不落进预提交', async () => {
    const e = engine();
    e._setSeatTimeoutsForTest(1, 1);
    stubAgents(e);
    const pid = inner(e).state.players[0].id;
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;
    e.on('discussion_speeches', () => e.resolveDiscussion());

    await inner(e).runDiscussion();

    const late = e.pushSeatSpeech(pid, '网络慢,迟到的发言');
    expect(late).toEqual({ accepted: false, reason: 'already_spoken' });
    expect(inner(e).precommittedSpeeches.has(pid)).toBe(false);
  });

  it('按时发言的路径不受影响(对照组)', async () => {
    const e = engine();
    e._setSeatTimeoutsForTest(5000, 5000);
    stubAgents(e);
    const pid = inner(e).state.players[0].id;
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;
    let batch: Array<{ playerId: string; isHuman?: boolean }> = [];
    e.on('discussion_speeches', (s: typeof batch) => { batch = s; e.resolveDiscussion(); });

    const run = inner(e).runDiscussion();
    await new Promise((r) => setTimeout(r, 10));
    expect(e.pushSeatSpeech(pid, '我按时说了')).toEqual({ accepted: true });
    await run;
    expect(batch.find((s) => s.playerId === pid)?.isHuman).toBe(true);
  });

  it('讨论进行中才占座:本轮提交明确拒绝(no_pending_speech),不再被下一轮开局静默清掉', async () => {
    const e = engine();
    e._setSeatTimeoutsForTest(5000, 5000);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubAgents(e, async () => { await gate; return 'stub'; });
    inner(e).state.phase = GamePhase.DISCUSSION;
    e.on('discussion_speeches', () => e.resolveDiscussion());

    const run = inner(e).runDiscussion();           // AI 波次卡在 gate 上
    await new Promise((r) => setTimeout(r, 10));
    const late = inner(e).state.players[1].id;
    expect(e.setSeatHuman(late).ok).toBe(true);     // 波次进行中占座
    expect(e.pushSeatSpeech(late, '我刚坐下')).toEqual({ accepted: false, reason: 'no_pending_speech' });
    expect(inner(e).precommittedSpeeches.has(late)).toBe(false);
    release();
    await run;
  });

  it('AI 波次进行中 destroy:runDiscussion 立即收尾,不再等 4 分钟硬超时', async () => {
    const e = engine();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubAgents(e, async () => { await gate; return 'stub'; });
    inner(e).state.phase = GamePhase.DISCUSSION;

    const run = inner(e).runDiscussion();
    await new Promise((r) => setTimeout(r, 10));
    e.destroy();
    release();
    const outcome = await Promise.race([
      run.then(() => 'returned'),
      new Promise((r) => setTimeout(() => r('hung'), 1500)),
    ]);
    expect(outcome).toBe('returned');
    expect(inner(e).discussionResolver).toBeUndefined();
  });
});

describe('v6.160 语言 — 外语局 prompt 不混进中文', () => {
  it('嘉宾发言署名:英文局用英文署名,中文局保持原样', () => {
    expect(formatHumanSpeechForPrompt('hr', 'explain yourself, Bob', 'en')).toBe(
      '[Human HR (the real person chairing this meeting)] explain yourself, Bob');
    expect(formatHumanSpeechForPrompt('hr', '小王解释一下')).toBe('【真人HR(主持会议的人类)】小王解释一下');
    for (const id of ['hr', 'union', 'lawyer', 'reporter'] as const) {
      expect(formatHumanSpeechForPrompt(id, 'hi', 'en')).not.toMatch(HAN);
      expect(formatHumanSpeechForPrompt(id, 'hi', 'ja')).not.toMatch(HAN);
    }
  });

  it('引擎里嘉宾发言进滑窗时按局内语言署名', () => {
    const en = engine('en');
    en.pushHumanSpeech('reporter', 'who leaked the OKR doc?');
    expect(inner(en).humanSpeeches.at(-1)).not.toMatch(HAN);
    const zh = engine('zh');
    zh.pushHumanSpeech('reporter', '谁泄露的');
    expect(inner(zh).humanSpeeches.at(-1)).toMatch(/^【真人记者/);
  });

  it('讨论上下文:外语局用英文描述,没有英文描述的中文事件不进 prompt', () => {
    const ev = (description: string, descriptionEn?: string): GameEvent =>
      ({ round: 1, phase: GamePhase.DISCUSSION, type: 'x', description, ...(descriptionEn ? { descriptionEn } : {}), timestamp: 0 });
    const events = [
      ev('🎭 观众给 Bob 打了聚光灯', '🎭 The audience put a spotlight on Bob'),
      ev('阶段切换: discussion'),
      ev('plain ascii event'),
    ];
    const en = buildDiscussionContextFn(1, [], [], undefined, undefined, events, [], 'en');
    expect(en).not.toMatch(HAN);
    expect(en).toContain('spotlight on Bob');
    expect(en).toContain('plain ascii event');
    const zh = buildDiscussionContextFn(1, [], [], undefined, undefined, events, [], 'zh');
    expect(zh).toContain('观众给 Bob 打了聚光灯');
  });

  it('引擎真实事件:英文局观众干预后的讨论上下文不含汉字', () => {
    const e = engine('en');
    const target = inner(e).state.players[0];
    expect(e.applyIntervention('spotlight', target.id).accepted).toBe(true);
    expect(e.applyIntervention('clue').accepted).toBe(true);
    const ctx = inner(e).buildDiscussionContext();
    expect(ctx).not.toMatch(HAN);
    expect(ctx).toContain('spotlight');
  });

  it('金句池预置:中文局照常注入,外语局不注入', async () => {
    const zh = engine('zh');
    await inner(zh).seedHotQuoteHints();
    expect(inner(zh).leakedHints.join('')).toContain('老板画的饼');
    const en = engine('en');
    await inner(en).seedHotQuoteHints();
    expect(inner(en).leakedHints).toEqual([]);
  });

  it('公司主题包跨局记忆:中文局照常生成片段,外语局不生成', async () => {
    const zh = engine('zh');
    const zhOut = await inner(zh).loadPackMemorySnippets('abcdef123456', ['Alice', 'Bob']);
    expect(Object.keys(zhOut).sort()).toEqual(['Alice', 'Bob']);
    const en = engine('en');
    expect(await inner(en).loadPackMemorySnippets('abcdef123456', ['Alice', 'Bob'])).toEqual({});
  });
});
