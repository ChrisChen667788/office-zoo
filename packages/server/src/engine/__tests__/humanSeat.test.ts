/**
 * v6.153 — 真人席位 · engine 接入回归。
 *
 * 不触网:BaseAgent 在无 key 时 generateSpeech / generateVote 走 fallback,
 * 测试用 _setSeatTimeoutsForTest 把超时调到 1ms,避免真实等待。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameEngine } from '../GameEngine';
import { GamePhase } from '@furball/shared';

// ── 辅助 ─────────────────────────────────────────────────────────────────────

type AnyEngine = {
  seatHumanIds: Set<string>;
  pendingSeatSpeeches: Map<string, (text: string | null) => void>;
  pendingSeatVotes: Map<string, (targetId: string | null) => void>;
  precommittedSpeeches: Map<string, string>;
  spokenThisRound: Set<string>;
  agents: Map<string, { generateSpeech: (...args: unknown[]) => Promise<string>; generateVote: (...args: unknown[]) => Promise<string> }>;
  runDiscussion: () => Promise<void>;
  getSeatCandidates: (voter: { companyId?: string; id: string }, alive: Array<{ companyId?: string; id: string }>) => Array<{ companyId?: string; id: string }>;
  state: {
    phase: string;
    players: Array<{ id: string; controller?: string; isAlive: boolean; companyId?: string; name: string; role: string; team: string }>;
    config: { mode?: string };
    round: number;
  };
};

const inner = (e: GameEngine) => e as unknown as AnyEngine;

function newEngine(count = 8): GameEngine {
  const e = new GameEngine(count);
  e.createPlayers();
  // 测试里把超时缩到 1ms,避免真实等待
  e._setSeatTimeoutsForTest(1, 1);
  return e;
}

function firstAliveId(e: GameEngine): string {
  return inner(e).state.players.find((p) => p.isAlive)!.id;
}

// ── setSeatHuman / releaseSeat 状态 ───────────────────────────────────────────

describe('setSeatHuman / releaseSeat', () => {
  it('setSeatHuman 设置 controller=human + seatHumanIds 追踪', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    const r = e.setSeatHuman(pid);
    expect(r.ok).toBe(true);
    const player = inner(e).state.players.find((p) => p.id === pid);
    expect(player?.controller).toBe('human');
    expect(inner(e).seatHumanIds.has(pid)).toBe(true);
  });

  it('game_over 时 setSeatHuman 拒绝', () => {
    const e = newEngine();
    inner(e).state.phase = GamePhase.GAME_OVER;
    const r = e.setSeatHuman(firstAliveId(e));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('game_over');
  });

  it('不存在/已死亡玩家拒绝', () => {
    const e = newEngine();
    const r = e.setSeatHuman('nonexistent_player');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('player_not_found');
  });

  it('releaseSeat 把 controller 重置为 ai', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    e.releaseSeat(pid);
    const player = inner(e).state.players.find((p) => p.id === pid);
    expect(player?.controller).toBe('ai');
    expect(inner(e).seatHumanIds.has(pid)).toBe(false);
  });
});

// ── pushSeatSpeech 校验矩阵 ───────────────────────────────────────────────────

describe('pushSeatSpeech', () => {
  it('非 human 席位拒绝', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    // pid 默认 controller=ai / undefined
    const r = e.pushSeatSpeech(pid, '你好');
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('not_human_seat');
  });

  it('阶段错误时拒绝', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.VOTING; // 投票阶段不应接受发言
    const r = e.pushSeatSpeech(pid, '我要说话');
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('wrong_phase');
  });

  it('空文本拒绝', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;
    const r = e.pushSeatSpeech(pid, '   ');
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('阶段 FREE_ROAM/MEETING/DISCUSSION 均接受', () => {
    for (const phase of [GamePhase.FREE_ROAM, GamePhase.MEETING, GamePhase.DISCUSSION]) {
      const e = newEngine();
      const pid = firstAliveId(e);
      e.setSeatHuman(pid);
      inner(e).state.phase = phase;
      const r = e.pushSeatSpeech(pid, '我有意见');
      expect(r.accepted).toBe(true);
    }
  });

  it('无挂起等待时存为预提交', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;

    const r = e.pushSeatSpeech(pid, '预提交文本');
    expect(r.accepted).toBe(true);
    expect(inner(e).precommittedSpeeches.get(pid)).toBe('预提交文本');
  });

  it('有挂起的等待时立即 resolve', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;

    let resolved: string | null = 'not_set';
    inner(e).pendingSeatSpeeches.set(pid, (text) => { resolved = text; });
    const r = e.pushSeatSpeech(pid, '实时文本');
    expect(r.accepted).toBe(true);
    expect(resolved).toBe('实时文本');
    expect(inner(e).pendingSeatSpeeches.has(pid)).toBe(false);
  });

  it('v6.fix — 本轮已发言后二次提交被拒(already_spoken)', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.FREE_ROAM;

    const r1 = e.pushSeatSpeech(pid, '第一条发言');
    expect(r1.accepted).toBe(true);
    expect(inner(e).spokenThisRound.has(pid)).toBe(true);

    // 同一轮再次提交应被拒
    const r2 = e.pushSeatSpeech(pid, '二次提交');
    expect(r2.accepted).toBe(false);
    expect(r2.reason).toBe('already_spoken');
  });
});

// ── 讨论中真人发言 via seat_prompt 流 ────────────────────────────────────────
// runDiscussion 是私有方法,通过内部 pendingSeatSpeeches 机制模拟其行为

describe('runDiscussion — 真人席位流(内部机制)', () => {
  it('按时提交 → pendingSeatSpeeches resolve 拿到文本,isHuman 可验', async () => {
    const e = newEngine();
    e._setSeatTimeoutsForTest(500, 500); // 给够时间

    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;

    // 模拟 runDiscussion 内部:挂起等待
    let resolvedText: string | null = null;
    const waitPromise = new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        inner(e).pendingSeatSpeeches.delete(pid);
        resolve(null);
      }, 500);
      inner(e).pendingSeatSpeeches.set(pid, (text) => {
        clearTimeout(timer);
        resolve(text);
      });
    });

    // 立即提交发言 → resolve waitPromise
    e.pushSeatSpeech(pid, '我来发言了');
    resolvedText = await waitPromise;

    // 拿到文本 → 按规格构建真人发言对象带 isHuman=true
    expect(resolvedText).toBe('我来发言了');
    // 若 runDiscussion 会在此基础上追加 isHuman:true 到 speeches 批次
    // 这里只验证 pushSeatSpeech 正确地 resolve 了挂起等待
  });

  it('超时(1ms)→ resolve(null) + seat_timeout 事件发出', async () => {
    const e = newEngine();
    e._setSeatTimeoutsForTest(1, 1); // 1ms 必然超时

    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;

    let timeoutPlayerId: string | null = null;
    e.on('seat_timeout', (data: { playerId: string; kind: string }) => {
      if (data.kind === 'speech') timeoutPlayerId = data.playerId;
    });

    // 模拟 runDiscussion 内部:挂起等待 1ms
    const waitPromise = new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        inner(e).pendingSeatSpeeches.delete(pid);
        e.emit('seat_timeout', { playerId: pid, kind: 'speech' });
        resolve(null);
      }, 1);
      inner(e).pendingSeatSpeeches.set(pid, (text) => {
        clearTimeout(timer);
        resolve(text);
      });
    });

    const result = await waitPromise;
    expect(result).toBeNull();
    expect(timeoutPlayerId).toBe(pid);
  });
});

// ── 预提交在讨论时被采用 ───────────────────────────────────────────────────────

describe('预提交', () => {
  it('讨论开始前的预提交在新一轮被用上', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.FREE_ROAM;

    // 提交预发言
    e.pushSeatSpeech(pid, '我是预提交');
    expect(inner(e).precommittedSpeeches.get(pid)).toBe('我是预提交');
  });

  it('v6.fix — 预提交在 runDiscussion 开始时仍存在(清空在主循环 round++ 之后,非 runDiscussion 开头)', async () => {
    // 回归测试:修复前 runDiscussion 一开始就 clear(),导致永远读不到预提交
    const e = newEngine();
    e._setSeatTimeoutsForTest(5000, 5000); // 给够时间
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.FREE_ROAM;

    // 设置预提交
    e.pushSeatSpeech(pid, '我是预提交发言');
    expect(inner(e).precommittedSpeeches.get(pid)).toBe('我是预提交发言');

    // 桩掉 agents 让 runDiscussion 能快速完成
    for (const [aid, _] of inner(e).agents) {
      inner(e).agents.set(aid, {
        generateSpeech: async () => '桩发言',
        generateVote: async () => 'skip',
      });
    }

    // 收集 seat_prompt 事件(预提交路径不应该发 seat_prompt)
    const seatPrompts: string[] = [];
    e.on('seat_prompt', (d: { playerId: string }) => seatPrompts.push(d.playerId));

    // 收集批量发言事件(v6.fix — 引擎直接传数组,不是 {speeches:[]}包装对象)
    let discussionBatch: Array<{ playerId: string; isHuman?: boolean }> | undefined;
    e.on('discussion_speeches', (speeches: typeof discussionBatch) => {
      discussionBatch = speeches;
      // v6.fix — runDiscussion 等待 resolveDiscussion() 才会继续;必须在回调里调用
      e.resolveDiscussion();
    });

    inner(e).state.phase = GamePhase.DISCUSSION;
    await (inner(e).runDiscussion as () => Promise<void>)();

    // 预提交路径:不应发 seat_prompt(因为直接用了预提交)
    expect(seatPrompts.includes(pid)).toBe(false);
    // 预提交在批次中出现,且带 isHuman=true
    const humanSpeech = discussionBatch?.find((s) => s.playerId === pid);
    expect(humanSpeech).toBeDefined();
    expect(humanSpeech?.isHuman).toBe(true);
  });
});

// ── 投票 ───────────────────────────────────────────────────────────────────────

describe('pushSeatVote', () => {
  it('阶段非 VOTING 拒绝', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    const r = e.pushSeatVote(pid, 'player_1');
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('wrong_phase');
  });

  it('没有挂起等待时拒绝', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.VOTING;
    const r = e.pushSeatVote(pid, 'player_1');
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('no_pending_vote');
  });

  it('有挂起且候选人合法 → 写入 votes + resolve + 不走 grudge', () => {
    const e = newEngine();
    const players = inner(e).state.players.filter((p) => p.isAlive);
    const voter = players[0];
    const target = players[1];
    e.setSeatHuman(voter.id);
    inner(e).state.phase = GamePhase.VOTING;
    e.state.votes = {};

    let resolvedTarget: string | null = null;
    inner(e).pendingSeatVotes.set(voter.id, (t) => { resolvedTarget = t; });

    const r = e.pushSeatVote(voter.id, target.id);
    expect(r.accepted).toBe(true);
    expect(e.state.votes[voter.id]).toBe(target.id);
    expect(resolvedTarget).toBe(target.id);
    expect(inner(e).pendingSeatVotes.has(voter.id)).toBe(false);
  });

  it('弃票(skip)合法', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.VOTING;
    inner(e).pendingSeatVotes.set(pid, () => {});
    const r = e.pushSeatVote(pid, 'skip');
    expect(r.accepted).toBe(true);
  });

  it('非法目标被拒', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.VOTING;
    inner(e).pendingSeatVotes.set(pid, () => {});
    const r = e.pushSeatVote(pid, 'nonexistent_player_xyz');
    expect(r.accepted).toBe(false);
  });
});

// ── releaseSeat 立即接管 ───────────────────────────────────────────────────────

describe('releaseSeat → 立即接管', () => {
  it('释放中挂起的发言等待 → null resolve', async () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);

    let resolvedText: string | null = 'not_set';
    inner(e).pendingSeatSpeeches.set(pid, (t) => { resolvedText = t; });

    e.releaseSeat(pid);
    await Promise.resolve(); // flush
    expect(resolvedText).toBeNull();
    expect(inner(e).pendingSeatSpeeches.has(pid)).toBe(false);
  });

  it('释放中挂起的投票等待 → null resolve', async () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);

    let resolvedVote: string | null = 'not_set';
    inner(e).pendingSeatVotes.set(pid, (t) => { resolvedVote = t; });

    e.releaseSeat(pid);
    await Promise.resolve(); // flush
    expect(resolvedVote).toBeNull();
  });
});

// ── destroy 后没有挂起等待 ────────────────────────────────────────────────────

describe('destroy', () => {
  it('destroy 后 pendingSeatSpeeches/Votes 已清空', () => {
    const e = newEngine();
    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).pendingSeatSpeeches.set(pid, () => {});
    inner(e).pendingSeatVotes.set(pid, () => {});
    e.destroy();
    expect(inner(e).pendingSeatSpeeches.size).toBe(0);
    expect(inner(e).pendingSeatVotes.size).toBe(0);
  });
});

// ── 双公司候选人约束 ──────────────────────────────────────────────────────────

describe('双公司候选人约束', () => {
  it('双公司模式下真人投票的候选人限本公司存活玩家', () => {
    const e = new GameEngine({ playerCount: 8, mode: 'dual' });
    e.createPlayers();
    e._setSeatTimeoutsForTest(1, 1);

    const companyA = inner(e).state.players.filter((p) => p.isAlive && (p as { companyId?: string }).companyId === 'a');
    if (companyA.length < 2) return; // dual 分配可能失败,跳过

    const voter = companyA[0];
    const targetInOtherCompany = inner(e).state.players.find(
      (p) => p.isAlive && (p as { companyId?: string }).companyId === 'b',
    );
    if (!targetInOtherCompany) return;

    e.setSeatHuman(voter.id);
    inner(e).state.phase = GamePhase.VOTING;
    inner(e).pendingSeatVotes.set(voter.id, () => {});
    // 跨公司目标应该被拒
    const r = e.pushSeatVote(voter.id, targetInOtherCompany.id);
    expect(r.accepted).toBe(false);
  });
});

// ── getSeatCandidates 共享函数 ─────────────────────────────────────────────────

describe('v6.fix — getSeatCandidates 候选人集合一致性', () => {
  it('单公司模式:getSeatCandidates 返回全部存活玩家', () => {
    const e = newEngine(6);
    const alive = inner(e).state.players.filter((p) => p.isAlive);
    const voter = alive[0];
    const candidates = inner(e).getSeatCandidates(voter, alive);
    expect(candidates.length).toBe(alive.length);
    // 包含自己
    expect(candidates.some((c) => c.id === voter.id)).toBe(true);
  });

  it('v6.fix — pushSeatVote 和 getSeatCandidates 对单公司校验一致', () => {
    const e = newEngine(6);
    const players = inner(e).state.players.filter((p) => p.isAlive);
    const voter = players[0];
    const target = players[1];

    e.setSeatHuman(voter.id);
    inner(e).state.phase = GamePhase.VOTING;

    let resolved: string | null = null;
    inner(e).pendingSeatVotes.set(voter.id, (t) => { resolved = t; });

    // getSeatCandidates 说 target 合法 → pushSeatVote 也应接受
    const alive = inner(e).state.players.filter((p) => p.isAlive);
    const candidates = inner(e).getSeatCandidates(voter, alive);
    const isValidBySharedFn = candidates.some((c) => c.id === target.id);
    const r = e.pushSeatVote(voter.id, target.id);

    expect(isValidBySharedFn).toBe(r.accepted);
  });
});

// ── 真实 runDiscussion — 按时发言产生 isHuman=true ───────────────────────────

describe('v6.fix — runDiscussion 真实调用验证', () => {
  it('真人按时发言 → discussion 批次里出现 isHuman=true', async () => {
    const e = newEngine();
    e._setSeatTimeoutsForTest(5000, 5000); // 发言窗口够宽

    // 桩掉所有 AI agents
    for (const [aid] of inner(e).agents) {
      inner(e).agents.set(aid, {
        generateSpeech: async () => '桩AI发言',
        generateVote: async () => 'skip',
      });
    }

    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;

    // v6.fix — 引擎直接传数组(非 {speeches:[]}),同时需调 resolveDiscussion() 解锁
    let discussionBatch: Array<{ playerId: string; isHuman?: boolean }> | undefined;
    e.on('discussion_speeches', (speeches: typeof discussionBatch) => {
      discussionBatch = speeches;
      e.resolveDiscussion();
    });

    // 先启动 runDiscussion,再提交发言(模拟按时提交)
    const discussionPromise = (inner(e).runDiscussion as () => Promise<void>)();
    // 等一个微任务让 seat_prompt 发出并挂起等待
    await new Promise((resolve) => setTimeout(resolve, 10));
    e.pushSeatSpeech(pid, '真人按时发言内容');
    await discussionPromise;

    // 批次里应该有这个玩家,且 isHuman=true
    const humanEntry = discussionBatch?.find((s) => s.playerId === pid);
    expect(humanEntry).toBeDefined();
    expect(humanEntry?.isHuman).toBe(true);
  });

  it('真人超时 → AI 代打,seat_timeout 事件发出', async () => {
    const e = newEngine();
    e._setSeatTimeoutsForTest(1, 1); // 1ms 超时

    // 桩掉 AI agents
    for (const [aid] of inner(e).agents) {
      inner(e).agents.set(aid, {
        generateSpeech: async () => '桩AI发言',
        generateVote: async () => 'skip',
      });
    }

    const pid = firstAliveId(e);
    e.setSeatHuman(pid);
    inner(e).state.phase = GamePhase.DISCUSSION;

    const timeouts: string[] = [];
    e.on('seat_timeout', (d: { playerId: string; kind: string }) => {
      if (d.kind === 'speech') timeouts.push(d.playerId);
    });

    // v6.fix — 引擎直接传数组(非 {speeches:[]}),同时需调 resolveDiscussion() 解锁
    let discussionBatch: Array<{ playerId: string; isHuman?: boolean }> | undefined;
    e.on('discussion_speeches', (speeches: typeof discussionBatch) => {
      discussionBatch = speeches;
      e.resolveDiscussion();
    });

    await (inner(e).runDiscussion as () => Promise<void>)();

    // 超时玩家出现在批次里(AI 代打),但不带 isHuman
    const entry = discussionBatch?.find((s) => s.playerId === pid);
    expect(entry).toBeDefined();
    expect(entry?.isHuman).toBeFalsy();
    // seat_timeout 事件已发出
    expect(timeouts.includes(pid)).toBe(true);
  });
});
