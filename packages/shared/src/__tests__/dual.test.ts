/**
 * v6.85 P1 — 双公司对抗纯引擎回归(拍板:4+4 / 内鬼带身份 / ~15 分钟)。
 * 公司分配 / 市占率竞速 / 挖人概率 / 跨司限额 / 终局判定 / 跳槽关系事件 / 节奏护栏。
 */
import { describe, it, expect } from 'vitest';
import {
  assignDualCompanies, emptyMarket, advanceMarket, marketWinner,
  poachChance, resolvePoach, eventsFromDefection,
  canCrossAction, recordCrossAction, dualWinner,
  DUAL_RATS_PER_COMPANY, MARKET_WIN, MARKET_STEP, MAX_DUAL_ROUNDS, DEFECTION_KEEPS_TEAM,
} from '../dual/dual';

const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

describe('dual — assignDualCompanies', () => {
  it('4+4 且每公司恰好 1 个内鬼', () => {
    const m = assignDualCompanies(ids, ['p2', 'p5'])!;
    expect(m).toBeTruthy();
    const aSide = ids.filter((i) => m[i] === 'a');
    const bSide = ids.filter((i) => m[i] === 'b');
    expect(aSide).toHaveLength(DUAL_RATS_PER_COMPANY);
    expect(bSide).toHaveLength(DUAL_RATS_PER_COMPANY);
    expect(m['p2']).toBe('a');
    expect(m['p5']).toBe('b');
  });
  it('输入不合法 → null(人数≠8 / dog≠2 / dog 不在名单)', () => {
    expect(assignDualCompanies(ids.slice(0, 6), ['p0', 'p1'])).toBeNull();
    expect(assignDualCompanies(ids, ['p0'])).toBeNull();
    expect(assignDualCompanies(ids, ['p0', 'nope'])).toBeNull();
  });
});

describe('dual — 市占率', () => {
  it('完成任务推进 + 封顶', () => {
    let m = advanceMarket(emptyMarket(), 'a', 2);
    expect(m).toEqual({ a: MARKET_STEP * 2, b: 0 });
    m = advanceMarket(m, 'a', 999);
    expect(m.a).toBe(MARKET_WIN);
  });
  it('marketWinner:先到 100 赢,双到/双没到 null', () => {
    expect(marketWinner({ a: MARKET_WIN, b: 50 })).toBe('a');
    expect(marketWinner({ a: 50, b: 50 })).toBeNull();
    expect(marketWinner({ a: MARKET_WIN, b: MARKET_WIN })).toBeNull();
  });
  it('拍板③节奏护栏:典型产出(2 任务/轮)能在回合上限内垄断', () => {
    // 2 任务/轮 × STEP → 到 100 所需轮数必须 ≤ MAX_DUAL_ROUNDS
    expect(Math.ceil(MARKET_WIN / (2 * MARKET_STEP))).toBeLessThanOrEqual(MAX_DUAL_ROUNDS);
  });
});

describe('dual — 挖人', () => {
  it('概率 = 0.15 + feeling/200,夹 [0.05, 0.6]', () => {
    expect(poachChance(0)).toBe(0.15);
    expect(poachChance(90)).toBe(0.6);   // 过命交情顶满
    expect(poachChance(-100)).toBe(0.05); // 世仇压底
  });
  it('resolvePoach:roll 注入确定性', () => {
    expect(resolvePoach(0.3, 0.29)).toBe(true);
    expect(resolvePoach(0.3, 0.3)).toBe(false);
  });
  it('拍板②:DEFECTION_KEEPS_TEAM = true(内鬼身份带过去)', () => {
    expect(DEFECTION_KEEPS_TEAM).toBe(true);
  });
  it('eventsFromDefection:老同事全员记叛变(不含自己)', () => {
    const evs = eventsFromDefection({
      defectorArch: 'x', oldColleagueArchs: ['x', 'y', 'z'], gameId: 'g', round: 3, ts: 9,
    });
    expect(evs).toHaveLength(2);
    expect(evs.every((e) => e.kind === 'backstab' && e.actorId === 'x')).toBe(true);
    expect(evs.map((e) => e.subjectId).sort()).toEqual(['y', 'z']);
  });
});

describe('dual — 跨司动作限额', () => {
  it('每公司每回合 1 次,跨回合重置', () => {
    let l = recordCrossAction({}, 'a', 2);
    expect(canCrossAction(l, 'a', 2)).toBe(false);
    expect(canCrossAction(l, 'b', 2)).toBe(true);  // 另一家不受影响
    expect(canCrossAction(l, 'a', 3)).toBe(true);  // 下一轮重置
    l = recordCrossAction(l, 'b', 2);
    expect(canCrossAction(l, 'b', 2)).toBe(false);
  });
});

describe('dual — dualWinner 终局矩阵', () => {
  const base = {
    market: { a: 40, b: 30 }, aliveA: 4, aliveB: 4,
    insiderAliveA: true, insiderAliveB: true, round: 3,
  };
  it('没满足任何终局 → 继续打', () => {
    expect(dualWinner(base)).toEqual({ winner: null, reason: null });
  });
  it('🏆 垄断优先级最高', () => {
    expect(dualWinner({ ...base, market: { a: 100, b: 99 }, aliveA: 1 }))
      .toEqual({ winner: 'a', reason: 'monopoly' });
  });
  it('💀 团灭:活人 ≤1 的输', () => {
    expect(dualWinner({ ...base, aliveA: 1 })).toEqual({ winner: 'b', reason: 'wipeout' });
    // 双团灭 → 比市占率(a 领先)
    expect(dualWinner({ ...base, aliveA: 1, aliveB: 0 })).toEqual({ winner: 'a', reason: 'wipeout' });
  });
  it('🐀 双内鬼皆裁 → 比市占率;打平 winner null', () => {
    expect(dualWinner({ ...base, insiderAliveA: false, insiderAliveB: false }))
      .toEqual({ winner: 'a', reason: 'insiders_down' });
    expect(dualWinner({ ...base, market: { a: 50, b: 50 }, insiderAliveA: false, insiderAliveB: false }))
      .toEqual({ winner: null, reason: 'insiders_down' });
  });
  it('单边内鬼被裁不结束(那是公司内政)', () => {
    expect(dualWinner({ ...base, insiderAliveA: false })).toEqual({ winner: null, reason: null });
  });
  it('⏱ 回合上限兜底 → 比市占率', () => {
    expect(dualWinner({ ...base, round: MAX_DUAL_ROUNDS }))
      .toEqual({ winner: 'a', reason: 'round_cap' });
  });
});
