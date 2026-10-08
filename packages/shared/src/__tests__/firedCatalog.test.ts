/**
 * v6.140-141 — 裁了么场景目录回归网:目录持续增长(v6.116-119 + v6.136-139 两批 +8),
 * 锁住结构不变式,新场景写漏字段/撞 id 直接红。
 * v6.158 — 第三批 +4 + 季节限定机制(isScenarioInSeason + seasonal 字段约束)。
 * fix(lane-phaseE) — 补齐 v6.158 规格要求的非法月份测试项。
 */
import { describe, it, expect } from 'vitest';
import { type FiredScenario, SCENARIOS, HR_PERSONALITIES, isScenarioInSeason } from '../data/fired';

describe('fired — SCENARIOS 目录不变式', () => {
  it('id 全局唯一', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('必填字段非空 + 数值合法', () => {
    for (const s of SCENARIOS) {
      expect(s.id.length, s.id).toBeGreaterThan(0);
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.description.length, s.id).toBeGreaterThan(10);
      expect(s.legalSituation.length, s.id).toBeGreaterThan(30);
      expect(s.hrOpeningLine.length, s.id).toBeGreaterThan(10);
      expect(s.playerContext.length, s.id).toBeGreaterThan(10);
      expect(s.winCondition.length, s.id).toBeGreaterThan(5);
      expect([1, 2, 3]).toContain(s.difficulty);
      expect(s.maxCompensation, s.id).toBeGreaterThan(0);
      expect(s.emoji.length, s.id).toBeGreaterThan(0);
    }
  });
  it('三批 Phase E 场景(v6.116-119 + v6.136-139 + v6.158)全部在目录', () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    for (const id of [
      // 第一批
      'pua-quit-trap', 'age-35-optimize', 'non-compete-trap', 'overtime-clawback',
      // 第二批
      'year-end-bonus-clawback', 'demotion-pay-cut', 'pregnancy-perf-trap', 'background-check-threat',
      // 第三批 (v6.158)
      'spring-layoff-rush', 'offer-revoked-before-onboard', 'dispatch-worker-returned', 'double11-overtime-bill',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
  it('seasonal 字段存在时 months 合法(1–12)且 label 非空', () => {
    for (const s of SCENARIOS) {
      if (!s.seasonal) continue;
      expect(s.seasonal.months.length, `${s.id}.months 不能为空`).toBeGreaterThan(0);
      expect(s.seasonal.label.length, `${s.id}.label 不能为空`).toBeGreaterThan(0);
      for (const m of s.seasonal.months) {
        expect(m, `${s.id} month ${m} 超出范围`).toBeGreaterThanOrEqual(1);
        expect(m, `${s.id} month ${m} 超出范围`).toBeLessThanOrEqual(12);
      }
    }
  });
  it('seasonal 场景的 wire 结构保留 seasonal 字段(spread 不丢失可选属性)', () => {
    // 模拟服务端 wire 映射: {...s, source:'seed', likes:0, plays:0, createdAt:0}
    // 确认 seasonal 字段被 spread 保留
    const seasonalScenarios = SCENARIOS.filter((s) => s.seasonal);
    expect(seasonalScenarios.length, '应至少有 1 条 seasonal 场景').toBeGreaterThan(0);
    for (const s of seasonalScenarios) {
      const wire = { ...s, source: 'seed' as const, likes: 0, plays: 0, createdAt: 0 };
      expect(wire.seasonal, `${s.id} wire 应含 seasonal`).toBeDefined();
      expect(wire.seasonal?.months, `${s.id} wire.seasonal.months 应存在`).toBeDefined();
      expect(wire.seasonal?.label, `${s.id} wire.seasonal.label 应存在`).toBeDefined();
    }
  });
});

describe('isScenarioInSeason — v6.158 季节判断纯函数', () => {
  const noSeasonal = SCENARIOS.find((s) => !s.seasonal)!;
  const jan = new Date(2025, 0, 15);  // 1 月
  const feb = new Date(2025, 1, 10);  // 2 月
  const mar = new Date(2025, 2, 5);   // 3 月
  const oct = new Date(2025, 9, 1);   // 10 月
  const nov = new Date(2025, 10, 11); // 11 月

  it('无 seasonal 字段的场景恒为 true', () => {
    expect(isScenarioInSeason(noSeasonal, jan)).toBe(true);
    expect(isScenarioInSeason(noSeasonal, feb)).toBe(true);
    expect(isScenarioInSeason(noSeasonal, mar)).toBe(true);
  });
  it('spring-layoff-rush: 1/2 月在季,3 月不在季', () => {
    const s = SCENARIOS.find((x) => x.id === 'spring-layoff-rush')!;
    expect(isScenarioInSeason(s, jan)).toBe(true);
    expect(isScenarioInSeason(s, feb)).toBe(true);
    expect(isScenarioInSeason(s, mar)).toBe(false);
  });
  it('double11-overtime-bill: 10/11 月在季,1 月不在季', () => {
    const s = SCENARIOS.find((x) => x.id === 'double11-overtime-bill')!;
    expect(isScenarioInSeason(s, oct)).toBe(true);
    expect(isScenarioInSeason(s, nov)).toBe(true);
    expect(isScenarioInSeason(s, jan)).toBe(false);
  });
  it('date 参数缺省时使用 new Date()(不崩溃)', () => {
    const s = SCENARIOS.find((x) => x.id === 'spring-layoff-rush')!;
    expect(typeof isScenarioInSeason(s)).toBe('boolean');
  });
  // fix(lane-phaseE) — 非法月份覆盖:months 含越界值(13/-1)时,
  // getMonth()+1 恒在 1–12 内,includes 永远命中不了越界值 → 恒返回 false
  it('seasonal.months 含非法值(13/-1):任何真实月份均不在该数组内,恒返回 false', () => {
    const fakeWith13 = {
      ...noSeasonal,
      seasonal: { months: [13], label: '非法测试' },
    } as FiredScenario;
    expect(isScenarioInSeason(fakeWith13, jan)).toBe(false);
    expect(isScenarioInSeason(fakeWith13, nov)).toBe(false);

    const fakeWithNeg = {
      ...noSeasonal,
      seasonal: { months: [-1], label: '非法测试' },
    } as FiredScenario;
    expect(isScenarioInSeason(fakeWithNeg, jan)).toBe(false);
    expect(isScenarioInSeason(fakeWithNeg, oct)).toBe(false);
  });
});

describe('fired — HR_PERSONALITIES sanity', () => {
  it('三档反派齐备且 systemPrompt/话术非空', () => {
    const ids = HR_PERSONALITIES.map((p) => p.id);
    for (const need of ['rookie', 'veteran', 'demon']) expect(ids).toContain(need);
    for (const p of HR_PERSONALITIES) {
      expect(p.systemPrompt.length, p.id).toBeGreaterThan(50);
      expect(p.commonTactics.length, p.id).toBeGreaterThan(0);
    }
  });
});
