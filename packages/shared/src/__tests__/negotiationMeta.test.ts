/**
 * v6.59 — 方案 B(局间成长)+ C(职场遗物)纯数值回归。职级阶梯 / BOSS 解锁 /
 * 卡解锁 / 结算奖励;遗物对 config 的叠加 + 姿态封印。
 */
import { describe, it, expect } from 'vitest';
import { initBattle, type BattleOutcome, type BattleState } from '../negotiation/battle';
import { chooseHRStance } from '../negotiation/sim';
import {
  BOSS_TIERS,
  CAREER_LEVELS,
  awardFromOutcome,
  bossById,
  cardsUnlockedAtLevel,
  levelFromXp,
  nextLevel,
  unlockedBosses,
  unlockedCardIds,
  xpProgress,
} from '../negotiation/progression';
import { applyRelics, relicById } from '../negotiation/relics';

describe('progression — 职级阶梯', () => {
  it('levelFromXp picks the highest reached tier', () => {
    expect(levelFromXp(0).title).toBe('实习生');
    expect(levelFromXp(59).title).toBe('实习生');
    expect(levelFromXp(60).title).toBe('老油条');
    expect(levelFromXp(179).title).toBe('老油条');
    expect(levelFromXp(180).title).toBe('维权斗士');
    expect(levelFromXp(9999).title).toBe('劳动法之神');
  });

  it('nextLevel is null at the cap', () => {
    expect(nextLevel(0)?.title).toBe('老油条');
    expect(nextLevel(CAREER_LEVELS[CAREER_LEVELS.length - 1].minXp)).toBeNull();
  });

  it('xpProgress reports into/span, span null at cap', () => {
    expect(xpProgress(0)).toEqual({ into: 0, span: 60 });
    expect(xpProgress(80)).toEqual({ into: 20, span: 120 }); // L2 老油条 (60→180)
    expect(xpProgress(9999).span).toBeNull();
  });
});

describe('progression — BOSS / 卡解锁', () => {
  it('unlockedBosses widens with level', () => {
    expect(unlockedBosses(1).map((b) => b.id)).toEqual(['hr']);
    expect(unlockedBosses(2).map((b) => b.id)).toEqual(['hr', 'hrd']);
    expect(unlockedBosses(3).map((b) => b.id)).toEqual(['hr', 'hrd', 'ceo']);
    // v6.66 — 第 4 档「资本本尊」满级专属
    expect(unlockedBosses(4).map((b) => b.id)).toEqual(['hr', 'hrd', 'ceo', 'capital']);
  });

  it('harder bosses pay more', () => {
    expect(bossById('ceo').rewardMult).toBeGreaterThan(bossById('hr').rewardMult);
    expect(bossById('nope').id).toBe('hr'); // fallback
    expect(BOSS_TIERS.length).toBe(4);
  });

  it('v6.66 — capital is the apex tier (level 4, richest reward)', () => {
    const capital = bossById('capital');
    expect(capital.minLevel).toBe(4);
    expect(capital.rewardMult).toBe(Math.max(...BOSS_TIERS.map((b) => b.rewardMult)));
    expect(capital.config.budget).toBe(Math.max(...BOSS_TIERS.map((b) => b.config.budget ?? 0)));
  });

  it('cards unlock by level', () => {
    expect(unlockedCardIds(1)).not.toContain('arbitration');
    expect(unlockedCardIds(2)).toContain('arbitration');
    expect(unlockedCardIds(3)).toContain('media_expose');
    expect(cardsUnlockedAtLevel(2)).toEqual(['arbitration']);
    expect(cardsUnlockedAtLevel(1)).toEqual([]);
  });
});

describe('progression — awardFromOutcome', () => {
  const settled = (tier: 0 | 1 | 2 | 3): BattleOutcome => ({ kind: 'settled', tier, multiple: 'x' });
  it('scales reward by tier and boss multiplier', () => {
    expect(awardFromOutcome(settled(3), 1)).toEqual({ xp: 70, severance: 6 });
    expect(awardFromOutcome(settled(1), 1.6)).toEqual({ xp: 32, severance: 2 }); // 20×1.6, 1×1.6→2
  });
  it('flipped is a consolation, caved is discounted, ongoing is zero', () => {
    expect(awardFromOutcome({ kind: 'flipped', tier: 0, multiple: '未谈成' })).toEqual({ xp: 3, severance: 0 });
    expect(awardFromOutcome({ kind: 'caved', tier: 2, multiple: '2N' })).toEqual({ xp: 28, severance: 2 }); // 40×.7, 3×.7→2
    expect(awardFromOutcome({ kind: 'ongoing' })).toEqual({ xp: 0, severance: 0 });
  });
});

describe('relics — applyRelics', () => {
  it('no relics → base config untouched, no exclusions', () => {
    const base = { budget: 90, patience: 9 };
    const eff = applyRelics([], base);
    expect(eff.config).toEqual(base);
    expect(eff.excludeStances).toEqual([]);
    expect(base).toEqual({ budget: 90, patience: 9 }); // not mutated
  });

  it('工会卡 +1 chipRegen, 赔偿计算器 -18 budget (stack)', () => {
    const eff = applyRelics(['union_card', 'comp_calc'], { budget: 90 });
    expect(eff.config.chipRegen).toBe(3); // default 2 +1
    expect(eff.config.budget).toBe(72); // 90 - 18
  });

  it('大厂 offer doubles morale but cuts patience (risk/reward, budget untouched)', () => {
    const eff = applyRelics(['big_offer'], { budget: 100, morale: 100, patience: 8 });
    expect(eff.config.morale).toBe(200);
    expect(eff.config.patience).toBe(6); // 8 - 2
    expect(eff.config.budget).toBe(100); // untouched (BUDGET_MAX clamp would nullify a bump)
  });

  it('录音笔 seals the 威胁背调 stance', () => {
    expect(applyRelics(['recorder']).excludeStances).toContain('threat');
  });

  it('relicById known/unknown', () => {
    expect(relicById('recorder')?.name).toBe('录音笔');
    expect(relicById('nope')).toBeUndefined();
  });
});

describe('relics × sim — excluded stance never chosen', () => {
  it('chooseHRStance honours the 录音笔 exclusion across many draws', () => {
    const s: BattleState = initBattle({ budget: 40, patience: 2 }); // desperate → would normally favour threat
    let i = 0;
    const rand = () => ((i = (i * 9301 + 49297) % 233280), i / 233280); // cheap LCG
    for (let n = 0; n < 200; n++) {
      expect(chooseHRStance(s, rand, ['threat'])).not.toBe('threat');
    }
  });
});
