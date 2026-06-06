/**
 * v6.57 — 「裁了么」闯关牌局 方案 A 纯数值核心的回归锁。覆盖克制系数、赔偿
 * 阶梯、四个 reducer 的数值与终局判定,以及整局模拟的可终止性 + 确定性。
 */
import { describe, it, expect } from 'vitest';
import {
  BUDGET_MAX,
  CARD_POOL,
  STANCE_POOL,
  cardById,
  compTierFromBudget,
  effectMultiplier,
  endRound,
  hrTakeStance,
  initBattle,
  playCard,
  settle,
  stanceById,
  tierLabel,
} from '../negotiation/battle';
import {
  MAX_ROUNDS,
  chooseEmployeePlan,
  simulateBattle,
} from '../negotiation/sim';

/** Deterministic PRNG (mulberry32) so seeded battles are reproducible. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('battle — 克制系数 / 赔偿阶梯 (pure math)', () => {
  it('effectMultiplier: resisted ×0.5, weakTo ×1.5, neutral ×1', () => {
    const pie = stanceById('pie'); // resists emotion, weakTo market
    expect(effectMultiplier('emotion', pie)).toBe(0.5);
    expect(effectMultiplier('market', pie)).toBe(1.5);
    expect(effectMultiplier('legal', pie)).toBe(1);
  });

  it('compTierFromBudget walks the 阶梯 at the right thresholds', () => {
    expect(compTierFromBudget(100)).toBe(0);
    expect(compTierFromBudget(67)).toBe(0);
    expect(compTierFromBudget(66)).toBe(1);
    expect(compTierFromBudget(34)).toBe(1);
    expect(compTierFromBudget(33)).toBe(2);
    expect(compTierFromBudget(1)).toBe(2);
    expect(compTierFromBudget(0)).toBe(3);
    expect(compTierFromBudget(-50)).toBe(3);
  });

  it('tierLabel maps tiers to the comp multiples', () => {
    expect(tierLabel(0)).toBe('未谈成');
    expect(tierLabel(1)).toBe('N+1');
    expect(tierLabel(2)).toBe('2N');
    expect(tierLabel(3)).toBe('3N');
  });

  it('every card tag has at least one stance that resists AND one weak to it', () => {
    for (const card of CARD_POOL) {
      expect(STANCE_POOL.some((s) => s.resists.includes(card.tag))).toBe(true);
      expect(STANCE_POOL.some((s) => s.weakTo.includes(card.tag))).toBe(true);
    }
  });
});

describe('battle — playCard reducer', () => {
  it('spends chips, drains budget by pressure×mult, hits patience, logs', () => {
    const s = initBattle({ startStance: 'stall' }); // stall resists legal
    const card = cardById('tenure_push')!; // tenure neutral vs stall → ×1
    const after = playCard(s, card.id);
    expect(after.chips).toBe(s.chips - card.cost);
    expect(after.budget).toBe(s.budget - card.pressure); // ×1
    expect(after.patience).toBe(s.patience - card.patienceHit);
    expect(after.log.length).toBe(1);
  });

  it('resisted card deals half, weakTo card deals 1.5×', () => {
    const sResist = initBattle({ startStance: 'kpi' }); // kpi resists tenure
    const tenure = cardById('tenure_push')!;
    expect(playCard(sResist, tenure.id).budget).toBe(BUDGET_MAX - Math.round(tenure.pressure * 0.5));

    const sWeak = initBattle({ startStance: 'kpi' }); // kpi weakTo legal
    const legal = cardById('labor_law')!;
    expect(playCard(sWeak, legal.id).budget).toBe(BUDGET_MAX - Math.round(legal.pressure * 1.5));
  });

  it('no-op when chips are insufficient', () => {
    const s = initBattle({ chips: 0 });
    expect(playCard(s, 'noncompete')).toBe(s);
  });

  it('budget hitting 0 settles at 3N', () => {
    const s = initBattle({ budget: 10, chips: 9, startStance: 'kpi' });
    const after = playCard(s, 'labor_law'); // 12 × 1.5 = 18 ≥ 10 → budget 0
    expect(after.budget).toBe(0);
    expect(after.outcome).toEqual({ kind: 'settled', tier: 3, multiple: '3N' });
  });

  it('is immutable — original state untouched', () => {
    const s = initBattle();
    const snapshotChips = s.chips;
    playCard(s, 'tenure_push');
    expect(s.chips).toBe(snapshotChips);
    expect(s.log.length).toBe(0);
  });

  it('no-op once the battle is terminal', () => {
    const s = settle(initBattle({ budget: 30 }));
    expect(playCard(s, 'tenure_push')).toBe(s);
  });
});

describe('battle — hrTakeStance / endRound / settle', () => {
  it('hrTakeStance sets stance and drains morale; 0 morale → caved at current tier', () => {
    const s = initBattle({ morale: 8, budget: 50 }); // budget 50 = tier 1
    const after = hrTakeStance(s, 'threat'); // moraleDrain 15 → morale ≤ 0
    expect(after.stance).toBe('threat');
    expect(after.outcome).toEqual({ kind: 'caved', tier: 1, multiple: 'N+1' });
  });

  it('endRound regens chips (capped), ticks patience, advances round', () => {
    const s = initBattle({ chips: 5, chipRegen: 2, chipMax: 6, patience: 4 });
    const after = endRound(s);
    expect(after.chips).toBe(6); // 5+2 capped at 6
    expect(after.patience).toBe(3);
    expect(after.round).toBe(2);
  });

  it('endRound dropping patience to 0 flips the table (bust)', () => {
    const s = initBattle({ patience: 1 });
    expect(endRound(s).outcome).toEqual({ kind: 'flipped', tier: 0, multiple: '未谈成' });
  });

  it('settle locks in the current budget tier', () => {
    expect(settle(initBattle({ budget: 20 })).outcome).toEqual({ kind: 'settled', tier: 2, multiple: '2N' });
    expect(settle(initBattle({ budget: 90 })).outcome).toEqual({ kind: 'settled', tier: 0, multiple: '未谈成' });
  });
});

describe('sim — employee strategy', () => {
  it('banks immediately when already at/above the target tier', () => {
    const s = initBattle({ budget: 30 }); // tier 2 ≥ TARGET_TIER
    expect(chooseEmployeePlan(s)).toEqual({ settle: true, cardIds: [] });
  });

  it('banks a tier-1 gain rather than risk a 掀桌 when patience is low', () => {
    const s = initBattle({ budget: 60, patience: 1 }); // tier 1, patience ≤ RISK
    expect(chooseEmployeePlan(s).settle).toBe(true);
  });

  it('never plays a card the current stance resists', () => {
    const s = initBattle({ budget: 100, startStance: 'kpi', chips: 6 }); // kpi resists tenure
    const plan = chooseEmployeePlan(s);
    const tags = plan.cardIds.map((id) => cardById(id)!.tag);
    expect(tags).not.toContain('tenure');
  });
});

describe('sim — simulateBattle (integration)', () => {
  it('always terminates with a valid terminal outcome within MAX_ROUNDS', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = simulateBattle({}, rng(seed));
      expect(['settled', 'caved', 'flipped']).toContain(s.outcome.kind);
      expect(s.round).toBeLessThanOrEqual(MAX_ROUNDS + 1);
      expect(s.budget).toBeGreaterThanOrEqual(0);
      expect(s.budget).toBeLessThanOrEqual(BUDGET_MAX);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = simulateBattle({}, rng(7));
    const b = simulateBattle({}, rng(7));
    expect(b.outcome).toEqual(a.outcome);
    expect(b.log).toEqual(a.log);
  });

  it('a high-budget + paper-thin-patience start busts (flips), never high comp', () => {
    const s = simulateBattle({ budget: 100, patience: 1, morale: 100 }, rng(3));
    expect(s.outcome.kind).not.toBe('settled'); // can't have banked 2N/3N from a doomed start
  });

  it('a near-won start (low budget) banks a real tier, never busts', () => {
    const s = simulateBattle({ budget: 20 }, rng(5)); // tier 2 from the start
    expect(s.outcome.kind).toBe('settled');
    if (s.outcome.kind === 'settled') expect(s.outcome.tier).toBeGreaterThanOrEqual(2);
  });
});
