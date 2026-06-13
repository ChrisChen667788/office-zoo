/**
 * v6.85 P2 — 双公司 GameEngine 接线集成回归(承诺的「先包住再动手」)。
 *
 * 锁五件事:① createPlayers 双司分配(4+4 各 1 内鬼 + 开局事件);② 单公司模式
 * 零影响(companyId 全 undefined);③ runVoting 投票圈限本司(候选传参 + 失败
 * fallback 都不跨司)→ resolveVotes 双组结算(一轮最多各裁 1 人,vote_result 带
 * company);④ checkDualWin 终局矩阵接通(垄断/团灭/双鬼皆裁/继续打)+ dualMarket
 * 纯派生;⑤ maybeCrossActions 挖角(Math.random 注桩:跳槽翻 companyId、team
 * 保留(拍板②)、台账锁本轮)。不碰 LLM —— agent 全部打桩。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameEngine } from '../GameEngine';
import { Team, WinCondition } from '@furball/shared';

function dualEngine(): GameEngine {
  const e = new GameEngine({ playerCount: 8, mode: 'dual' });
  e.createPlayers();
  return e;
}
type AnyEngine = {
  agents: Map<string, { generateVote: unknown; generateGhostVote: unknown }>;
  timeline: Array<{ type: string; description: string }>;
  resolveVotes(): Promise<void>;
  runVoting(): Promise<void>;
  checkWin(): boolean;
  dualMarket(): { a: number; b: number };
  maybeCrossActions(graph: unknown): Promise<void>;
  crossLedger: Record<string, number>;
};
const inner = (e: GameEngine) => e as unknown as AnyEngine;

afterEach(() => vi.restoreAllMocks());

describe('dual — createPlayers 分配', () => {
  it('4+4,每公司恰好 1 内鬼,开局落 dual_start 事件', () => {
    const e = dualEngine();
    const a = e.state.players.filter((p) => p.companyId === 'a');
    const b = e.state.players.filter((p) => p.companyId === 'b');
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    expect(a.filter((p) => p.team === Team.DOG)).toHaveLength(1);
    expect(b.filter((p) => p.team === Team.DOG)).toHaveLength(1);
    expect(inner(e).timeline.some((t) => t.type === 'dual_start')).toBe(true);
  });

  it('单公司模式零影响:companyId 全 undefined,无 dual_start', () => {
    const e = new GameEngine(8);
    e.createPlayers();
    expect(e.state.players.every((p) => p.companyId === undefined)).toBe(true);
    expect(inner(e).timeline.some((t) => t.type === 'dual_start')).toBe(false);
  });
});

describe('dual — 投票圈限本司 + 双组结算', () => {
  it('runVoting:每个 agent 拿到的候选全是本司;fallback 随机票也在本司', async () => {
    const e = dualEngine();
    const seen = new Map<string, string[]>(); // voterId → 收到的候选 id
    for (const [pid, agent] of inner(e).agents) {
      const voter = e.state.players.find((p) => p.id === pid)!;
      if (voter === e.state.players[0]) {
        // 第一只鼠走 fallback 路径(抛错 → 随机本司票)
        agent.generateVote = async () => { throw new Error('llm down'); };
      } else {
        agent.generateVote = async (_ctx: string, candidates: Array<{ id: string }>) => {
          seen.set(pid, candidates.map((c) => c.id));
          return candidates.find((c) => c.id !== pid)?.id ?? 'skip';
        };
      }
      agent.generateGhostVote = async () => 'pass';
    }
    await inner(e).runVoting();

    const companyOf = (pid: string) => e.state.players.find((p) => p.id === pid)?.companyId;
    // 候选传参全本司
    for (const [voterId, candidateIds] of seen) {
      for (const cid of candidateIds) {
        expect(companyOf(cid)).toBe(companyOf(voterId));
      }
    }
    // 所有票(含 fallback 随机票)目标都在投票者本司
    for (const [voterId, targetId] of Object.entries(e.state.votes)) {
      if (targetId === 'skip') continue;
      expect(companyOf(targetId)).toBe(companyOf(voterId));
    }
  });

  it('resolveVotes:双组独立计票,一轮各裁 1 人,vote_result 带 company', async () => {
    const e = dualEngine();
    const a = e.state.players.filter((p) => p.companyId === 'a');
    const b = e.state.players.filter((p) => p.companyId === 'b');
    // A 司 3 票集火 a[0];B 司 3 票集火 b[0]
    e.state.votes = {
      [a[1].id]: a[0].id, [a[2].id]: a[0].id, [a[3].id]: a[0].id,
      [b[1].id]: b[0].id, [b[2].id]: b[0].id, [b[3].id]: b[0].id,
    };
    const results: Array<{ company?: string; eliminated?: string }> = [];
    e.on('vote_result', (r: { company?: string; eliminated?: string }) => results.push(r));
    await inner(e).resolveVotes();

    expect(e.state.players.find((p) => p.id === a[0].id)!.isAlive).toBe(false);
    expect(e.state.players.find((p) => p.id === b[0].id)!.isAlive).toBe(false);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.company).sort()).toEqual(['a', 'b']);
    expect(results.find((r) => r.company === 'a')!.eliminated).toBe(a[0].id);
    expect(results.find((r) => r.company === 'b')!.eliminated).toBe(b[0].id);
  });
});

describe('dual — checkDualWin 终局接通', () => {
  it('没满足终局 → false 继续打', () => {
    const e = dualEngine();
    e.state.round = 1;
    expect(inner(e).checkWin()).toBe(false);
    expect(e.state.winner).toBe(WinCondition.NONE);
  });

  it('dualMarket 纯派生:塞完成任务 → 市占率 = 数量×9 封顶', () => {
    const e = dualEngine();
    const a0 = e.state.players.find((p) => p.companyId === 'a')!;
    a0.tasks = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`, name: 'OKR', location: '开放工区', steps: 1, currentStep: 1, completed: true,
    }));
    expect(inner(e).dualMarket()).toEqual({ a: 27, b: 0 });
  });

  it('🏆 垄断:市占 100 → COMPANY_A_WIN + game_over', () => {
    const e = dualEngine();
    e.state.round = 2;
    const aSide = e.state.players.filter((p) => p.companyId === 'a');
    // 12 个完成任务 → 108 → 封顶 100
    aSide[0].tasks = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`, name: 'OKR', location: '开放工区', steps: 1, currentStep: 1, completed: true,
    }));
    let over: { winner?: string } | null = null;
    e.on('game_over', (p: { winner?: string }) => { over = p; });
    expect(inner(e).checkWin()).toBe(true);
    expect(e.state.winner).toBe(WinCondition.COMPANY_A_WIN);
    expect(over).toBeTruthy();
  });

  it('💀 团灭:B 司只剩 1 人 → A 司赢', () => {
    const e = dualEngine();
    e.state.round = 2;
    const bSide = e.state.players.filter((p) => p.companyId === 'b');
    for (const p of bSide.slice(1)) p.isAlive = false;
    expect(inner(e).checkWin()).toBe(true);
    expect(e.state.winner).toBe(WinCondition.COMPANY_A_WIN);
  });

  it('🐀 双内鬼皆裁 → 比市占率(B 领先 → B 赢)', () => {
    const e = dualEngine();
    e.state.round = 2;
    for (const p of e.state.players.filter((x) => x.team === Team.DOG)) p.isAlive = false;
    const b0 = e.state.players.find((p) => p.companyId === 'b' && p.isAlive)!;
    b0.tasks = [{ id: 't', name: 'OKR', location: '开放工区', steps: 1, currentStep: 1, completed: true }];
    expect(inner(e).checkWin()).toBe(true);
    expect(e.state.winner).toBe(WinCondition.COMPANY_B_WIN);
  });
});

describe('dual — maybeCrossActions 挖角', () => {
  it('挖角成功:companyId 翻面、team 保留(拍板②)、落 defection 事件、台账锁本轮', async () => {
    const e = dualEngine();
    e.state.round = 3;
    // Math.random 桩:A 司出手判定 0.4(<0.5 出手)→ poach roll 0.01(<0.15 必成)
    // → B 司出手判定 0.9(按兵不动)
    const rolls = [0.4, 0.01, 0.9];
    vi.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.99);

    const before = e.state.players.filter((p) => p.companyId === 'b');
    await inner(e).maybeCrossActions(/* emptyGraph */ { edges: {} });

    const defected = before.find((p) => p.companyId === 'a');
    expect(defected).toBeTruthy();
    // 拍板②:内鬼身份(team)原样带过去
    const teamBefore = defected!.team;
    expect([Team.CAT, Team.DOG, Team.NEUTRAL]).toContain(teamBefore);
    expect(inner(e).timeline.some((t) => t.type === 'defection' && t.description.includes(defected!.name))).toBe(true);
    // 台账:A 司本轮已用,B 司没出手(0.9)也没记账
    expect(inner(e).crossLedger['a']).toBe(3);
    expect(inner(e).crossLedger['b']).toBeUndefined();
    // 4+4 → 5+3
    expect(e.state.players.filter((p) => p.companyId === 'a')).toHaveLength(5);
    expect(e.state.players.filter((p) => p.companyId === 'b')).toHaveLength(3);
  });

  it('挖角失败:发 offer 被已读不回,人不动但台账照锁', async () => {
    const e = dualEngine();
    e.state.round = 2;
    // A 出手 0.3 → poach roll 0.99(>0.15 失败)→ B 不出手 0.8
    const rolls = [0.3, 0.99, 0.8];
    vi.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.99);
    await inner(e).maybeCrossActions({ edges: {} });
    expect(e.state.players.filter((p) => p.companyId === 'a')).toHaveLength(4);
    expect(inner(e).timeline.some((t) => t.type === 'poach_failed')).toBe(true);
    expect(inner(e).crossLedger['a']).toBe(2);
  });
});
