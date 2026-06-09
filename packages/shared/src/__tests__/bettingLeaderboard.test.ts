/**
 * v6.74 P3 — 下注盘全网战绩榜纯排序层回归:命中率 / 谁更阔 / upsert 峰值身家 /
 * 筹码榜 + 神算榜两种排法 + 样本门槛沉底。
 */
import { describe, it, expect } from 'vitest';
import {
  betHitRate, isBetterBetRun, upsertBestBetRun, rankBetRuns, MIN_SETTLED_FOR_RATE,
  type BetRun,
} from '../betting/leaderboard';

const mk = (over: Partial<BetRun> = {}): BetRun => ({
  userId: 'u', chips: 500, settled: 0, hits: 0, bestWin: 0, lifetimeWon: 0, ts: 1, ...over,
});

describe('bettingLeaderboard — betHitRate', () => {
  it('命中率 = 押中 / 结算,没结算算 0', () => {
    expect(betHitRate({ settled: 4, hits: 3 })).toBe(0.75);
    expect(betHitRate({ settled: 0, hits: 0 })).toBe(0);
  });
});

describe('bettingLeaderboard — isBetterBetRun', () => {
  it('身家主导:筹码多者更强', () => {
    expect(isBetterBetRun(mk({ chips: 900 }), mk({ chips: 800 }))).toBe(true);
    expect(isBetterBetRun(mk({ chips: 700 }), mk({ chips: 800 }))).toBe(false);
  });
  it('同身家比命中率', () => {
    const a = mk({ chips: 500, settled: 10, hits: 8 });
    const b = mk({ chips: 500, settled: 10, hits: 3 });
    expect(isBetterBetRun(a, b)).toBe(true);
  });
});

describe('bettingLeaderboard — upsertBestBetRun', () => {
  it('同 user 留身家最高那条', () => {
    const lo = mk({ userId: 'a', chips: 400 });
    const hi = mk({ userId: 'a', chips: 1200 });
    let list = upsertBestBetRun([], lo);
    expect(list).toHaveLength(1);
    list = upsertBestBetRun(list, hi);              // 更阔 → 替换
    expect(list).toHaveLength(1);
    expect(list[0].chips).toBe(1200);
    list = upsertBestBetRun(list, mk({ userId: 'a', chips: 300 })); // 更穷 → 不动
    expect(list[0].chips).toBe(1200);
  });
  it('不同 user 各占一行', () => {
    let list = upsertBestBetRun([], mk({ userId: 'a', chips: 600 }));
    list = upsertBestBetRun(list, mk({ userId: 'b', chips: 700 }));
    expect(list).toHaveLength(2);
  });
});

describe('bettingLeaderboard — rankBetRuns', () => {
  it("'chips' 模式:身家降序", () => {
    const runs = [mk({ userId: 'a', chips: 300 }), mk({ userId: 'b', chips: 900 }), mk({ userId: 'c', chips: 600 })];
    const out = rankBetRuns(runs, 10, 'chips');
    expect(out.map((r) => r.userId)).toEqual(['b', 'c', 'a']);
  });
  it("'hitRate' 模式:够样本者按命中率降序,运气哥(样本不足)沉底", () => {
    const proven = mk({ userId: 'pro', chips: 500, settled: MIN_SETTLED_FOR_RATE, hits: 4 }); // 0.8
    const mid = mk({ userId: 'mid', chips: 500, settled: MIN_SETTLED_FOR_RATE + 5, hits: 5 }); // 0.5
    const lucky = mk({ userId: 'luck', chips: 500, settled: 1, hits: 1 });                     // 1.0 但样本=1
    const out = rankBetRuns([mid, lucky, proven], 10, 'hitRate');
    expect(out.map((r) => r.userId)).toEqual(['pro', 'mid', 'luck']); // 运气哥再准也沉底
  });
  it('limit 截断 top-N', () => {
    const runs = [mk({ userId: 'a', chips: 900 }), mk({ userId: 'b', chips: 600 }), mk({ userId: 'c', chips: 300 })];
    expect(rankBetRuns(runs, 2)).toHaveLength(2);
  });
});
