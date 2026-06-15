/**
 * v6.87 — 公司战报卡纯数据层回归:分组/MVP/拔河条/缘由派生/嘴替分档。
 */
import { describe, it, expect } from 'vitest';
import { buildBattleCard, dualBar, type BattleCardInput } from '../dual/battleCard';

describe('dualBar — 对撞条退化', () => {
  it('有市占 → 按市占率,caption=市占率', () => {
    const m = dualBar({ a: 60, b: 20 }, 3, 4);
    expect(m.byMarket).toBe(true);
    expect(m.aFillPct).toBeCloseTo(75, 5); // 60/80
    expect(m.aLabel).toBe('🅰 60%');
    expect(m.bLabel).toBe('🅱 20%');
    expect(m.caption).toBe('市占率');
  });
  it('市占 0:0 → 退化成存活人数比', () => {
    const m = dualBar({ a: 0, b: 0 }, 3, 1);
    expect(m.byMarket).toBe(false);
    expect(m.aFillPct).toBeCloseTo(75, 5); // 3/4
    expect(m.aLabel).toBe('🅰 3 人');
    expect(m.bLabel).toBe('🅱 1 人');
    expect(m.caption).toContain('在职');
  });
  it('market undefined + 双 0 存活 → 居中兜底,不 NaN', () => {
    const m = dualBar(undefined, 0, 0);
    expect(m.aFillPct).toBe(50);
    expect(m.byMarket).toBe(false);
  });
});

function players(): BattleCardInput['players'] {
  return [
    { companyId: 'a', name: 'A1', isAlive: true, tasksCompleted: 5, roleLabel: '打工人' },
    { companyId: 'a', name: 'A2', isAlive: true, tasksCompleted: 2 },
    { companyId: 'a', name: 'A3', isAlive: false, tasksCompleted: 1 },
    { companyId: 'a', name: 'A4', isAlive: false, tasksCompleted: 0 },
    { companyId: 'b', name: 'B1', isAlive: true, tasksCompleted: 1 },
    { companyId: 'b', name: 'B2', isAlive: false, tasksCompleted: 0 },
    { companyId: 'b', name: 'B3', isAlive: false, tasksCompleted: 0 },
    { companyId: 'b', name: 'B4', isAlive: false, tasksCompleted: 0 },
  ];
}

describe('battleCard — 分组与 MVP', () => {
  it('按 companyId 分两栏,存活数/总数正确', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 60, b: 20 }, round: 5, players: players(), date: '2026-06-14' });
    expect(c.sides.a.total).toBe(4);
    expect(c.sides.a.survivors).toBe(2);
    expect(c.sides.b.survivors).toBe(1);
    expect(c.sides.a.isWinner).toBe(true);
    expect(c.sides.b.isWinner).toBe(false);
  });
  it('MVP = 存活里完成任务最多者', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 60, b: 20 }, round: 5, players: players(), date: '2026-06-14' });
    expect(c.sides.a.mvp).toBe('A1'); // 5 > 2
    expect(c.sides.b.mvp).toBe('B1');
  });
  it('全员阵亡 → MVP 为 null', () => {
    const dead = players().map((p) => (p.companyId === 'b' ? { ...p, isAlive: false } : p));
    const c = buildBattleCard({ winner: 'a', market: { a: 60, b: 0 }, round: 5, players: dead, date: '2026-06-14' });
    expect(c.sides.b.mvp).toBeNull();
    expect(c.sides.b.survivors).toBe(0);
  });
});

describe('battleCard — 拔河条 + 缘由', () => {
  it('marketBar 按市占率之比,求和为 1', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 60, b: 20 }, round: 5, players: players(), date: '2026-06-14' });
    expect(c.marketBar.a + c.marketBar.b).toBeCloseTo(1, 5);
    expect(c.marketBar.a).toBeCloseTo(0.75, 5); // 60/80
  });
  it('双 0 市占 → 拔河条各 0.5', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 0, b: 0 }, round: 8, players: players(), date: '2026-06-14' });
    expect(c.marketBar).toEqual({ a: 0.5, b: 0.5 });
  });
  it('传 dualReason 直接用其文案', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 100, b: 10 }, round: 4, players: players(), date: '2026-06-14', dualReason: 'monopoly' });
    expect(c.reasonText).toBe('市场垄断');
  });
  it('不传 dualReason:市占 100 → 派生「市场垄断」', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 100, b: 30 }, round: 6, players: players(), date: '2026-06-14' });
    expect(c.reasonText).toBe('市场垄断');
  });
  it('不传 dualReason:对家只剩 1 人 → 派生「对家团灭」', () => {
    const c = buildBattleCard({ winner: 'a', market: { a: 50, b: 40 }, round: 6, players: players(), date: '2026-06-14' });
    expect(c.reasonText).toBe('对家团灭'); // B 只剩 B1
  });
});

describe('battleCard — 标题/嘴替/自定义名', () => {
  it('winnerLabel 带 🅰/🅱 + 公司名', () => {
    const c = buildBattleCard({ winner: 'b', market: { a: 20, b: 70 }, round: 5, players: players(), date: '2026-06-14', labels: { a: '青藤', b: '巨浪' } });
    expect(c.winnerLabel).toBe('🅱 巨浪 笑到最后');
    expect(c.sides.a.label).toBe('青藤');
  });
  it('险胜档(市占差 ≤10)嘴替提「最后一回合」', () => {
    // 两司都 >1 人活,避免触发团灭文案
    const allAlive = players().map((p) => ({ ...p, isAlive: true }));
    const c = buildBattleCard({ winner: 'a', market: { a: 48, b: 42 }, round: 8, players: allAlive, date: '2026-06-14' });
    expect(c.tagline).toContain('险胜');
  });
});
