/**
 * v6.66 — 闯关牌局「全网战绩榜」纯排序层回归。
 * 算分口径(遣散费主导 → 赔偿档 → 利落度)+ upsert 个人最佳 + 排名截断。
 */
import { describe, it, expect } from 'vitest';
import {
  type NegRun,
  runScore,
  isBetterRun,
  upsertBestRun,
  rankRuns,
} from '../negotiation/leaderboard';

function run(p: Partial<NegRun> & { userId: string }): NegRun {
  return {
    severance: 0, xp: 0, outcomeKind: 'flipped', tier: 0, multiple: '未谈成',
    bossId: 'hr', bossName: 'HR 专员', bossEmoji: '🧑‍💼',
    careerTitle: '实习生', vibe: 'lose', rounds: 5, ts: 1000,
    ...p,
  };
}

describe('leaderboard — runScore', () => {
  it('遣散费主导排序', () => {
    expect(runScore({ severance: 6, tier: 1, rounds: 9 })).toBeGreaterThan(
      runScore({ severance: 5, tier: 3, rounds: 1 }),
    );
  });
  it('同遣散费比赔偿档', () => {
    expect(runScore({ severance: 3, tier: 3, rounds: 5 })).toBeGreaterThan(
      runScore({ severance: 3, tier: 1, rounds: 5 }),
    );
  });
  it('同档比利落度(回合少更高)', () => {
    expect(runScore({ severance: 3, tier: 2, rounds: 4 })).toBeGreaterThan(
      runScore({ severance: 3, tier: 2, rounds: 8 }),
    );
  });
});

describe('leaderboard — isBetterRun', () => {
  it('分高者更强', () => {
    expect(isBetterRun(run({ userId: 'a', severance: 6 }), run({ userId: 'a', severance: 3 }))).toBe(true);
    expect(isBetterRun(run({ userId: 'a', severance: 3 }), run({ userId: 'a', severance: 6 }))).toBe(false);
  });
  it('同分比新鲜度(新的赢)', () => {
    expect(isBetterRun(run({ userId: 'a', severance: 3, ts: 2000 }), run({ userId: 'a', severance: 3, ts: 1000 }))).toBe(true);
  });
});

describe('leaderboard — upsertBestRun', () => {
  it('同 userId 只留个人最佳', () => {
    let list: NegRun[] = [];
    list = upsertBestRun(list, run({ userId: 'a', severance: 3 }));
    list = upsertBestRun(list, run({ userId: 'a', severance: 6 })); // 更强 → 替换
    list = upsertBestRun(list, run({ userId: 'a', severance: 1 })); // 更弱 → 保留 6
    expect(list).toHaveLength(1);
    expect(list[0].severance).toBe(6);
  });
  it('不同 userId 各自一条', () => {
    let list: NegRun[] = [];
    list = upsertBestRun(list, run({ userId: 'a', severance: 3 }));
    list = upsertBestRun(list, run({ userId: 'b', severance: 5 }));
    expect(list).toHaveLength(2);
  });
});

describe('leaderboard — rankRuns', () => {
  it('按战力分降序 + 截断 top-N', () => {
    const list = [
      run({ userId: 'a', severance: 3 }),
      run({ userId: 'b', severance: 9 }),
      run({ userId: 'c', severance: 6 }),
    ];
    expect(rankRuns(list).map((r) => r.userId)).toEqual(['b', 'c', 'a']);
    expect(rankRuns(list, 2).map((r) => r.userId)).toEqual(['b', 'c']);
  });
  it('同分按时间新鲜度降序', () => {
    const list = [
      run({ userId: 'old', severance: 5, ts: 1000 }),
      run({ userId: 'new', severance: 5, ts: 2000 }),
    ];
    expect(rankRuns(list).map((r) => r.userId)).toEqual(['new', 'old']);
  });
});
