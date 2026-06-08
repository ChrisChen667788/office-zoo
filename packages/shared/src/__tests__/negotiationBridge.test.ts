/**
 * v6.66 — 主对局 → 闯关牌局桥接纯函数回归。
 * BOSS 按鼠名稳定挑 + 职级夹取 + 横幅文案 + 一把组好种子。
 */
import { describe, it, expect } from 'vitest';
import {
  pickBridgeBossId,
  clampBossToLevel,
  bridgeBanner,
  buildBridge,
  BOSS_TIERS,
} from '../index';

const IDS = BOSS_TIERS.map((b) => b.id);

describe('bridge — pickBridgeBossId', () => {
  it('返回合法 BOSS id', () => {
    for (const name of ['Tony', 'Lisa', '王富贵', '鼠鼠我啊']) {
      expect(IDS).toContain(pickBridgeBossId(name));
    }
  });
  it('同名稳定(不随机)', () => {
    expect(pickBridgeBossId('Tony')).toBe(pickBridgeBossId('Tony'));
  });
  it('空名兜底第一档', () => {
    expect(pickBridgeBossId('')).toBe(BOSS_TIERS[0].id);
  });
});

describe('bridge — clampBossToLevel', () => {
  it('已解锁则保留', () => {
    expect(clampBossToLevel('hr', 1)).toBe('hr');
  });
  it('锁了就降到最高已解锁', () => {
    expect(clampBossToLevel('capital', 1)).toBe('hr');   // Lv1 只解锁 hr
    expect(clampBossToLevel('capital', 3)).toBe('ceo');  // Lv3 最高 ceo
    expect(clampBossToLevel('capital', 4)).toBe('capital'); // 满级可选
  });
});

describe('bridge — bridgeBanner / buildBridge', () => {
  it('横幅带上鼠名 + BOSS 名', () => {
    expect(bridgeBanner('Tony', 'HR 专员')).toContain('Tony');
    expect(bridgeBanner('Tony', 'HR 专员')).toContain('HR 专员');
  });
  it('buildBridge 产出可用 BOSS(永不锁定)', () => {
    const plan = buildBridge('资本爱好者', 1);
    expect(plan.for).toBe('资本爱好者');
    expect(plan.bossId).toBe('hr'); // Lv1 无论 hash 到哪都夹回 hr
    expect(plan.banner).toContain('资本爱好者');
  });
});
