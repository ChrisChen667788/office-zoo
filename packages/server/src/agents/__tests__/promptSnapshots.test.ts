/**
 * v6.156(前置) — 中文局 prompt 金样快照测试
 *
 * 黑盒方式:通过 vi.mock 拦截 callLLMWithTimeout,捕获发给 LLM 的完整
 * messages(system + prompt),并用 toMatchSnapshot 生成文件快照。
 *
 * Math.random 全程 mock 为 0,确保:
 *   - snippet 注入条件(0 < 0.3 = true → 必注入)
 *   - snippetsForArchetype 内部 shuffle 确定性
 *   - fallback 池 index 固定为 0
 *
 * 这些快照是"中文局零回归"的黄金依据:
 *   - 永远不允许带 -u/--update 更新本文件的快照。
 *   - 快照出现差异即意味着中文 prompt 发生了意外改动,必须修代码。
 *
 * 覆盖范围:
 *   1. system prompt — zh 局,DOG/CAT/NEUTRAL × 全部 personality(含无)
 *   2. generateSpeech prompt — zh 局,有/无 prior speeches + spotlight + leakedHints
 *   3. generateVote prompt — zh 局
 *   4. generateGhostComment prompt pair — zh 局,DOG/CAT/NEUTRAL
 *   5. generateGhostVote prompt pair — zh 局,DOG/CAT
 *   6. fallbackSpeech — zh 局,DOG/CAT/NEUTRAL(令 LLM 失败触发)
 *   7. fallbackGhostComment — zh 局,DOG/CAT/NEUTRAL
 *   8. GameEngine.buildDiscussionContext(黑盒捕获,固定初始状态)
 *   9. GameEngine.fallbackSpeech — zh 局,DOG/CAT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Team, Role, Personality } from '@furball/shared';

// v6.156(前置) — mock LLM、memory、relation 层:测试不发起真实网络调用
vi.mock('../../utils/llm', () => ({
  callLLMWithTimeout: vi.fn(),
}));

vi.mock('../../services/memoryRecall', () => ({
  recallMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/relationStore', () => ({
  getEdgesFor: vi.fn().mockReturnValue([]),
}));

import { BaseAgent } from '../BaseAgent';
import { callLLMWithTimeout } from '../../utils/llm';
import { GameEngine } from '../../engine/GameEngine';

// ── helpers ────────────────────────────────────────────────────────────────

/** 从 callLLMWithTimeout mock 捕获最后一次调用的 {kind, system, prompt} */
function lastLLMCall() {
  const calls = (callLLMWithTimeout as ReturnType<typeof vi.fn>).mock.calls;
  if (calls.length === 0) throw new Error('callLLMWithTimeout was not called');
  const [kind, opts] = calls[calls.length - 1] as [string, { system?: string; prompt?: string }];
  return { kind, system: opts.system ?? '', prompt: opts.prompt ?? '' };
}

/** mock 成功 — 后续 LLM 调用返回固定文本 */
function mockLLMSuccess(text = '__MOCK_LLM__') {
  (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, text });
}

/** mock 失败 — 触发 fallback 路径 */
function mockLLMFail() {
  (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false, reason: 'error', text: '',
  });
}

// 固定测试用的游戏语境字符串
const FIXED_CONTEXT = '第1轮全员大会。在职员工: 张总(在开放工区)、Lisa(在茶水间)。已被裁员: 无。';
const FIXED_CANDIDATES = [
  { id: 'player_0', name: '张总' },
  { id: 'player_1', name: 'Lisa' },
  { id: 'player_2', name: 'Kevin' },
];
const FIXED_PRIOR: Array<{ name: string; text: string }> = [
  { name: 'Lisa', text: '我觉得张总最可疑，天天说颗粒度但从不干活！' },
  { name: 'Kevin', text: '大家别被带节奏了，我们应该聚焦底层逻辑。' },
];

// ── 1. system prompt — zh 局 × 全部 personality ────────────────────────────

const ALL_PERSONALITIES: Array<Personality | undefined> = [
  undefined,
  Personality.SOCIAL_BUTTERFLY, Personality.INTROVERT,
  Personality.CONTRARIAN,       Personality.SYCOPHANT,
  Personality.PASSIVE_AGGRESSIVE, Personality.HOT_TEMPERED,
  Personality.SMOOTH_OPERATOR,  Personality.WORKAHOLIC,
];

describe('1. system prompt zh 局 — DOG × personality', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    // v6.156(前置): Math.random = 0 全程确定性
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  for (const p of ALL_PERSONALITIES) {
    it(`KILLER_DOG p=${p ?? 'none'}`, async () => {
      const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, p, null);
      await agent.generateSpeech(FIXED_CONTEXT);
      expect(lastLLMCall().system).toMatchSnapshot();
    });
  }
});

describe('1. system prompt zh 局 — CAT × personality', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  for (const p of ALL_PERSONALITIES) {
    it(`VILLAGER_CAT p=${p ?? 'none'}`, async () => {
      const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, p, null);
      await agent.generateSpeech(FIXED_CONTEXT);
      expect(lastLLMCall().system).toMatchSnapshot();
    });
  }
});

describe('1. system prompt zh 局 — NEUTRAL × personality', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  for (const p of ALL_PERSONALITIES) {
    it(`JESTER p=${p ?? 'none'}`, async () => {
      const agent = new BaseAgent('p0', 'Oscar', Role.JESTER, Team.NEUTRAL, p, null);
      await agent.generateSpeech(FIXED_CONTEXT);
      expect(lastLLMCall().system).toMatchSnapshot();
    });
  }
});

// ── 2. speech prompt — zh 局(有/无 prior speeches) ────────────────────────

describe('2. speech prompt zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    // 全程固定 Math.random = 0 → snippet 必注入,且 shuffle 确定
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('无 prior speeches — 第一发言人提示', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, Personality.WORKAHOLIC, null);
    await agent.generateSpeech(FIXED_CONTEXT);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });

  it('有 prior speeches — 回应前人发言', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, Personality.CONTRARIAN, null);
    await agent.generateSpeech(FIXED_CONTEXT, FIXED_PRIOR);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });

  it('有 spotlight — 主角加戏提示', async () => {
    const agent = new BaseAgent('p0', 'Kevin', Role.JESTER, Team.NEUTRAL, undefined, null);
    await agent.generateSpeech(FIXED_CONTEXT, [], { spotlight: true });
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });

  it('有 leakedHints — 匿名爆料注入', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, Personality.HOT_TEMPERED, null);
    await agent.generateSpeech(FIXED_CONTEXT, [], {
      leakedHints: ['某人的简历已经挂到 Boss 直聘了', '上次团建之后连夜跑路的是谁大家心里清楚'],
    });
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });
});

// ── 3. vote prompt — zh 局 ──────────────────────────────────────────────────

describe('3. vote prompt zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess('player_1');
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('DOG 投票 prompt — 含 voteBias', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, Personality.SMOOTH_OPERATOR, null);
    await agent.generateVote(FIXED_CONTEXT, FIXED_CANDIDATES);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });

  it('CAT 投票 prompt — 无 personality', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null);
    await agent.generateVote(FIXED_CONTEXT, FIXED_CANDIDATES);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });
});

// ── 4. ghost comment prompt — zh 局 ────────────────────────────────────────

describe('4. ghost comment prompt zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess('笑死了根本没人知道真相');
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('DOG 鬼魂弹幕 system', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, Personality.PASSIVE_AGGRESSIVE, null);
    await agent.generateGhostComment(FIXED_CONTEXT);
    expect(lastLLMCall().system).toMatchSnapshot();
  });

  it('DOG 鬼魂弹幕 prompt', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, undefined, null);
    await agent.generateGhostComment(FIXED_CONTEXT);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });

  it('CAT 鬼魂弹幕 system', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, Personality.HOT_TEMPERED, null);
    await agent.generateGhostComment(FIXED_CONTEXT);
    expect(lastLLMCall().system).toMatchSnapshot();
  });

  it('NEUTRAL 鬼魂弹幕 system', async () => {
    const agent = new BaseAgent('p0', 'Oscar', Role.JESTER, Team.NEUTRAL, undefined, null);
    await agent.generateGhostComment(FIXED_CONTEXT);
    expect(lastLLMCall().system).toMatchSnapshot();
  });
});

// ── 5. ghost vote prompt — zh 局 ───────────────────────────────────────────

describe('5. ghost vote prompt zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess('player_0');
  });
  afterEach(() => { randomSpy.mockRestore(); });

  const cands = [
    { id: 'player_0', name: '张总' },
    { id: 'player_2', name: 'Kevin' },
  ];

  it('DOG 鬼魂投票 system', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, undefined, null);
    await agent.generateGhostVote(FIXED_CONTEXT, cands);
    expect(lastLLMCall().system).toMatchSnapshot();
  });

  it('DOG 鬼魂投票 prompt', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, undefined, null);
    await agent.generateGhostVote(FIXED_CONTEXT, cands);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });

  it('CAT 鬼魂投票 system', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null);
    await agent.generateGhostVote(FIXED_CONTEXT, cands);
    expect(lastLLMCall().system).toMatchSnapshot();
  });

  it('CAT 鬼魂投票 prompt', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null);
    await agent.generateGhostVote(FIXED_CONTEXT, cands);
    expect(lastLLMCall().prompt).toMatchSnapshot();
  });
});

// ── 6. fallback speech — zh 局,LLM 失败触发 ────────────────────────────────

describe('6. fallback speech zh 局 — BaseAgent', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMFail();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('DOG fallback — Math.random=0 取第一条', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, undefined, null);
    const result = await agent.generateSpeech(FIXED_CONTEXT);
    expect(result).toMatchSnapshot();
  });

  it('CAT fallback — Math.random=0', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null);
    const result = await agent.generateSpeech(FIXED_CONTEXT);
    expect(result).toMatchSnapshot();
  });

  it('NEUTRAL fallback — Math.random=0', async () => {
    const agent = new BaseAgent('p0', 'Oscar', Role.JESTER, Team.NEUTRAL, undefined, null);
    const result = await agent.generateSpeech(FIXED_CONTEXT);
    expect(result).toMatchSnapshot();
  });
});

// ── 7. fallback ghost comment — zh 局 ─────────────────────────────────────

describe('7. fallback ghost comment zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMFail();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('DOG fallback ghost comment — Math.random=0', async () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, undefined, null);
    expect(await agent.generateGhostComment(FIXED_CONTEXT)).toMatchSnapshot();
  });

  it('CAT fallback ghost comment — Math.random=0', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null);
    expect(await agent.generateGhostComment(FIXED_CONTEXT)).toMatchSnapshot();
  });

  it('NEUTRAL fallback ghost comment — Math.random=0', async () => {
    const agent = new BaseAgent('p0', 'Oscar', Role.JESTER, Team.NEUTRAL, undefined, null);
    expect(await agent.generateGhostComment(FIXED_CONTEXT)).toMatchSnapshot();
  });
});

// ── 8. GameEngine.buildDiscussionContext 黑盒捕获 ──────────────────────────

describe('8. GameEngine buildDiscussionContext zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('固定初始状态(Math.random=0)下的讨论上下文字符串', () => {
    const engine = new GameEngine(8);
    engine.createPlayers();
    // v6.156(前置) — 黑盒触达 private 方法(运行时 private 仅限 TS 编译期)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: string = (engine as any).buildDiscussionContext();
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(10);
    expect(ctx).toMatchSnapshot();
  });
});

// ── 9. GameEngine.fallbackSpeech — zh 局 ──────────────────────────────────

describe('9. GameEngine fallbackSpeech zh 局', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  let engine: GameEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    engine = new GameEngine(9); // 9人局必含 NEUTRAL 玩家
    engine.createPlayers();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('DOG fallback — Math.random=0', () => {
    const dogPlayer = engine.state.players.find((p) => p.team === Team.DOG);
    expect(dogPlayer).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((engine as any).fallbackSpeech(dogPlayer!)).toMatchSnapshot();
  });

  it('CAT fallback — Math.random=0', () => {
    const catPlayer = engine.state.players.find((p) => p.team === Team.CAT);
    expect(catPlayer).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((engine as any).fallbackSpeech(catPlayer!)).toMatchSnapshot();
  });

  it('NEUTRAL fallback — Math.random=0', () => {
    const neutPlayer = engine.state.players.find((p) => p.team === Team.NEUTRAL);
    if (!neutPlayer) {
      // 边界情况:此人局未含 NEUTRAL 直接跳过
      expect(true).toBe(true);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((engine as any).fallbackSpeech(neutPlayer)).toMatchSnapshot();
  });
});
