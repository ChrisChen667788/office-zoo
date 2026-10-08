/**
 * v6.160 — 裁了么筛选芯片计数与主网格同口径(不数未到季的季节限定场景)。
 */
import { describe, it, expect } from 'vitest';
import type { FiredScenario } from '@furball/shared';
import { filterFiredScenarios } from '../firedScenarioFilters';

type S = FiredScenario & { createdBy?: string };

function sc(id: string, extra: Partial<S> = {}): S {
  return {
    id, title: id, description: '', difficulty: 1, emoji: '🧪', legalSituation: '',
    hrOpeningLine: '', playerContext: '', winCondition: '', maxCompensation: 1,
    ...extra,
  };
}

const JUNE = new Date(2026, 5, 15);
const WINTER = { months: [1, 2], label: '春节限定' };
const SUMMER = { months: [6], label: '六月限定' };

const scenarios: S[] = [
  sc('mine-evergreen', { createdBy: 'me' }),
  sc('mine-offseason', { createdBy: 'me', seasonal: WINTER }),
  sc('mine-inseason', { createdBy: 'me', seasonal: SUMMER }),
  sc('faang-evergreen', { industry: 'faang' }),
  sc('faang-offseason', { industry: 'faang', seasonal: WINTER }),
  sc('sh-offseason', { region: 'shanghai', seasonal: WINTER }),
  sc('other'),
];

const base = { mineOnly: false, tribeOnly: false, myId: 'me', tribe: { industry: 'faang', region: 'shanghai' }, date: JUNE };

describe('filterFiredScenarios', () => {
  it('芯片计数不含未到季场景', () => {
    const r = filterFiredScenarios(scenarios, base);
    expect(r.mineCount).toBe(2);   // mine-evergreen + mine-inseason
    expect(r.tribeCount).toBe(1);  // faang-evergreen(另两个圈子场景未到季)
  });

  it('点开「我的创作」后主网格条数 = 芯片数字', () => {
    const all = filterFiredScenarios(scenarios, base);
    const mine = filterFiredScenarios(scenarios, { ...base, mineOnly: true });
    expect(mine.visible.map((s) => s.id)).toEqual(['mine-evergreen', 'mine-inseason']);
    expect(mine.visible.length).toBe(all.mineCount);
    expect(mine.offSeason.map((s) => s.id)).toEqual(['mine-offseason']);
  });

  it('点开「我的圈子」后主网格条数 = 芯片数字(行业或地域任一匹配)', () => {
    const all = filterFiredScenarios(scenarios, base);
    const tribe = filterFiredScenarios(scenarios, { ...base, tribeOnly: true });
    expect(tribe.visible.map((s) => s.id)).toEqual(['faang-evergreen']);
    expect(tribe.visible.length).toBe(all.tribeCount);
    expect(tribe.offSeason.map((s) => s.id)).toEqual(['faang-offseason', 'sh-offseason']);
  });

  it('无筛选:主网格只放当季,未到季的进 offSeason', () => {
    const r = filterFiredScenarios(scenarios, base);
    expect(r.visible.map((s) => s.id)).toEqual(['mine-evergreen', 'mine-inseason', 'faang-evergreen', 'other']);
    expect(r.offSeason.map((s) => s.id)).toEqual(['mine-offseason', 'faang-offseason', 'sh-offseason']);
  });

  it('换到当季月份,季节限定场景回到主网格并计入芯片', () => {
    const r = filterFiredScenarios(scenarios, { ...base, date: new Date(2026, 0, 20) });
    expect(r.mineCount).toBe(2); // mine-evergreen + mine-offseason(一月当季);mine-inseason 六月才有
    expect(r.tribeCount).toBe(3);
  });

  it('另一个芯片已激活时,芯片数字 = 点开后交集网格的条数', () => {
    const extra: S[] = [
      ...scenarios,
      sc('mine-faang', { createdBy: 'me', industry: 'faang' }),
    ];
    // 已开「我的圈子」→「我的创作」的数字按 mine ∩ tribe 算
    const tribeOn = filterFiredScenarios(extra, { ...base, tribeOnly: true });
    const both = filterFiredScenarios(extra, { ...base, tribeOnly: true, mineOnly: true });
    expect(both.visible.map((s) => s.id)).toEqual(['mine-faang']);
    expect(tribeOn.mineCount).toBe(both.visible.length);
    // 已开「我的创作」→「我的圈子」的数字同理
    const mineOn = filterFiredScenarios(extra, { ...base, mineOnly: true });
    expect(mineOn.tribeCount).toBe(both.visible.length);
    // 两个都没开时仍是各自独立的数
    const none = filterFiredScenarios(extra, base);
    expect(none.mineCount).toBe(3);
    expect(none.tribeCount).toBe(2);
  });

  it('没有行业/地域标签时圈子计数为 0,tribeOnly 不生效', () => {
    const r = filterFiredScenarios(scenarios, { ...base, tribe: {}, tribeOnly: true });
    expect(r.tribeCount).toBe(0);
    expect(r.visible.length).toBe(4);
  });
});
