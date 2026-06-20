/**
 * v6.83 — 观众干预道具纯引擎回归:道具表 / 限购 / 扣筹码不可变 / 不污染下注统计。
 */
import { describe, it, expect } from 'vitest';
import {
  INTERVENTION_ITEMS, interventionById, canBuyIntervention, buyIntervention,
  interventionsForMode, emptyProgress, INTERVENE_REASON_CN,
} from '../index';

const rich = { ...emptyProgress(0), chips: 1000 };

describe('intervene — 道具表', () => {
  it('四件套:shield/clue/spotlight/headhunt,价格为正,cap 为正', () => {
    expect(INTERVENTION_ITEMS.map((i) => i.id)).toEqual(['shield', 'clue', 'spotlight', 'headhunt']);
    for (const i of INTERVENTION_ITEMS) {
      expect(i.price).toBeGreaterThan(0);
      expect(i.perGameCap).toBeGreaterThan(0);
    }
    expect(interventionById('shield')!.needsTarget).toBe(true);
    expect(interventionById('clue')!.needsTarget).toBe(false);
    expect(interventionById('nope' as never)).toBeUndefined();
  });
  it('v6.87 猎头快递:dualOnly + 需选目标', () => {
    const hh = interventionById('headhunt')!;
    expect(hh.dualOnly).toBe(true);
    expect(hh.needsTarget).toBe(true);
  });
  it('interventionsForMode:单公司局过滤掉 dualOnly,双公司局全保留', () => {
    expect(interventionsForMode('single').map((i) => i.id)).toEqual(['shield', 'clue', 'spotlight']);
    expect(interventionsForMode('dual').map((i) => i.id)).toEqual(['shield', 'clue', 'spotlight', 'headhunt']);
  });
});

describe('intervene — canBuy', () => {
  it('筹码不够拒绝', () => {
    const poor = { ...emptyProgress(0), chips: 10 };
    expect(canBuyIntervention(poor, {}, 'shield')).toEqual({ ok: false, reason: 'insufficient_chips' });
  });
  it('达到每局限购拒绝(shield cap=1)', () => {
    expect(canBuyIntervention(rich, { shield: 1 }, 'shield')).toEqual({ ok: false, reason: 'cap_reached' });
    expect(canBuyIntervention(rich, { clue: 1 }, 'clue').ok).toBe(true); // clue cap=2,还能买
  });
});

describe('intervene — buy', () => {
  it('扣对价格 + 记台账,原对象不动(不可变)', () => {
    const r = buyIntervention(rich, {}, 'spotlight');
    expect(r.ok).toBe(true);
    expect(r.progress.chips).toBe(1000 - 150);
    expect(r.ledger.spotlight).toBe(1);
    expect(rich.chips).toBe(1000); // 原 progress 没被改
  });
  it('不污染下注统计(lifetimeStaked/settled 不动)', () => {
    const r = buyIntervention(rich, {}, 'shield');
    expect(r.progress.lifetimeStaked).toBe(rich.lifetimeStaked);
    expect(r.progress.settled).toBe(rich.settled);
  });
  it('连买到 cap 后第三次失败(clue cap=2)', () => {
    const a = buyIntervention(rich, {}, 'clue');
    const b = buyIntervention(a.progress, a.ledger, 'clue');
    const c = buyIntervention(b.progress, b.ledger, 'clue');
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe('cap_reached');
    expect(b.progress.chips).toBe(1000 - 400);
  });
});

describe('intervene — INTERVENE_REASON_CN(v6.93)', () => {
  it('覆盖服务端 + 引擎会回带的全部 reason', () => {
    // socketHandler 限流 + GameEngine.applyIntervention 的拒绝原因
    for (const r of ['rate_limited', 'game_over', 'no_targets', 'invalid_target', 'shield_active', 'not_dual']) {
      expect(typeof INTERVENE_REASON_CN[r]).toBe('string');
      expect(INTERVENE_REASON_CN[r].length).toBeGreaterThan(0);
    }
  });
  it('文案为中文(不是原始英文 reason)', () => {
    expect(INTERVENE_REASON_CN.shield_active).not.toMatch(/[a-z_]{4,}/);
    expect(INTERVENE_REASON_CN.not_dual).toContain('双公司');
  });
});
