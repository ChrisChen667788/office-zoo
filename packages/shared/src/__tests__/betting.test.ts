/**
 * v6.74 — 观众下注盘纯引擎回归:赔率 / 派彩 / 下注扣费 / 入账 / 每日补给+破产兜底 / 盘口构建。
 */
import { describe, it, expect } from 'vitest';
import {
  oddsFromProb, withOdds, settleBet, totalPayout, placeBet, creditResult, applyDrip,
  emptyProgress, roundVoteMarket, winningTeamMarket,
  STARTING_CHIPS, DAILY_DRIP, DRIP_INTERVAL_MS, BANKRUPT_FLOOR, MIN_ODDS,
  type Bet,
} from '../betting/betting';

describe('betting — oddsFromProb', () => {
  it('概率越低赔率越高', () => {
    expect(oddsFromProb(0.1)).toBeGreaterThan(oddsFromProb(0.5));
  });
  it('带 house edge(低于无抽水的 1/p)', () => {
    expect(oddsFromProb(0.5)).toBeLessThan(2); // 1/0.5=2,抽水后 <2
  });
  it('封下限 MIN_ODDS', () => {
    expect(oddsFromProb(0.99)).toBe(MIN_ODDS);
  });
  it('withOdds 给每个 option 附赔率', () => {
    const o = withOdds([{ id: 'a', label: 'A', prob: 0.25 }]);
    expect(o[0].odds).toBe(oddsFromProb(0.25));
  });
});

describe('betting — 结算', () => {
  const bet: Bet = { marketId: 'm', optionId: 'a', optionLabel: 'A', stake: 100, odds: 2.5, round: 1 };
  it('押中按锁定赔率派彩,押错 0', () => {
    expect(settleBet(bet, 'a')).toBe(250);
    expect(settleBet(bet, 'b')).toBe(0);
  });
  it('totalPayout 求和', () => {
    const b2: Bet = { ...bet, optionId: 'b', stake: 50, odds: 3 };
    expect(totalPayout([bet, b2], 'a')).toBe(250);
    expect(totalPayout([bet, b2], 'b')).toBe(150);
  });
});

describe('betting — 筹码经济', () => {
  it('placeBet 够才扣,不够拒绝', () => {
    const p = emptyProgress(0);
    const ok = placeBet(p, 100);
    expect(ok.ok).toBe(true);
    expect(ok.next.chips).toBe(STARTING_CHIPS - 100);
    expect(ok.next.lifetimeStaked).toBe(100);
    expect(placeBet(p, STARTING_CHIPS + 1).ok).toBe(false);
    expect(placeBet(p, 0).ok).toBe(false);
  });
  it('creditResult 加派彩 + 统计命中', () => {
    let p = emptyProgress(0);
    p = creditResult(p, 250, true);
    expect(p.chips).toBe(STARTING_CHIPS + 250);
    expect(p.lifetimeWon).toBe(250);
    expect(p.bestWin).toBe(250);
    expect(p.settled).toBe(1);
    expect(p.hits).toBe(1);
    p = creditResult(p, 0, false);
    expect(p.settled).toBe(2);
    expect(p.hits).toBe(1);
  });
  it('applyDrip 跨天补给,破产兜底', () => {
    const p = emptyProgress(0);
    const same = applyDrip(p, DRIP_INTERVAL_MS - 1);
    expect(same.chips).toBe(STARTING_CHIPS);                 // 没到一天不补
    const dripped = applyDrip(p, DRIP_INTERVAL_MS);
    expect(dripped.chips).toBe(STARTING_CHIPS + DAILY_DRIP); // 跨天补
    const broke = applyDrip({ ...p, chips: 10 }, 0);
    expect(broke.chips).toBe(BANKRUPT_FLOOR);                // 破产兜底
  });
});

describe('betting — 盘口构建', () => {
  it('roundVoteMarket:概率求和≈1,heat 高者出局概率更高(赔率更低)', () => {
    const m = roundVoteMarket('g1', 2, [
      { id: 'a', name: 'Tony', heat: 3 },
      { id: 'b', name: 'Lisa', heat: 0 },
    ]);
    const sum = m.options.reduce((s, o) => s + o.prob, 0);
    expect(sum).toBeCloseTo(1, 5);
    const a = m.options.find((o) => o.id === 'a')!;
    const b = m.options.find((o) => o.id === 'b')!;
    expect(a.prob).toBeGreaterThan(b.prob);
    expect(oddsFromProb(a.prob)).toBeLessThan(oddsFromProb(b.prob));
    expect(m.id).toBe('g1:r2:vote');
  });
  it('winningTeamMarket:存活人数多的阵营夺冠概率高;0 人阵营不进盘', () => {
    const m = winningTeamMarket('g1', { cat: 4, dog: 2, neutral: 0 });
    expect(m.options.map((o) => o.id).sort()).toEqual(['cat', 'dog']); // neutral 0 → 不进
    const cat = m.options.find((o) => o.id === 'cat')!;
    const dog = m.options.find((o) => o.id === 'dog')!;
    expect(cat.prob).toBeGreaterThan(dog.prob);
  });
});
