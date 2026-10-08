/**
 * v6.140-141 — 裁了么场景目录回归网:目录持续增长(v6.116-119 + v6.136-139 两批 +8),
 * 锁住结构不变式,新场景写漏字段/撞 id 直接红。
 */
import { describe, it, expect } from 'vitest';
import { SCENARIOS, HR_PERSONALITIES } from '../data/fired';

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
  it('两批 Phase E 场景(v6.116-119 + v6.136-139)全部在目录', () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    for (const id of [
      'pua-quit-trap', 'age-35-optimize', 'non-compete-trap', 'overtime-clawback',
      'year-end-bonus-clawback', 'demotion-pay-cut', 'pregnancy-perf-trap', 'background-check-threat',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
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
