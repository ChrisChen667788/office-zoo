/**
 * v6.65 — 赔偿谈判战绩卡文案纯函数回归。基调判定 + 卡面内容(标题/行/遗物可选)。
 */
import { describe, it, expect } from 'vitest';
import {
  type SettlementCardInput,
  buildSettlementCard,
  settlementVibe,
} from '../negotiation/shareCard';

const base: SettlementCardInput = {
  outcomeKind: 'settled', tier: 3, multiple: '3N',
  bossName: 'CEO 亲自下场', bossEmoji: '👑',
  rounds: 6, severance: 12, xp: 70, careerTitle: '维权斗士',
};

describe('shareCard — settlementVibe', () => {
  it('flipped is always lose', () => {
    expect(settlementVibe({ outcomeKind: 'flipped', tier: 0 })).toBe('lose');
  });
  it('tier 2-3 settled is win, tier 1 is meh, tier 0 is lose', () => {
    expect(settlementVibe({ outcomeKind: 'settled', tier: 3 })).toBe('win');
    expect(settlementVibe({ outcomeKind: 'settled', tier: 2 })).toBe('win');
    expect(settlementVibe({ outcomeKind: 'settled', tier: 1 })).toBe('meh');
    expect(settlementVibe({ outcomeKind: 'settled', tier: 0 })).toBe('lose');
  });
  it('caved with a tier is meh, caved empty-handed is lose', () => {
    expect(settlementVibe({ outcomeKind: 'caved', tier: 1 })).toBe('meh');
    expect(settlementVibe({ outcomeKind: 'caved', tier: 0 })).toBe('lose');
  });
});

describe('shareCard — buildSettlementCard', () => {
  it('win headline + rows + vibe', () => {
    const c = buildSettlementCard(base);
    expect(c.vibe).toBe('win');
    expect(c.headline).toContain('3N');
    const labels = c.rows.map((r) => r.label);
    expect(labels).toEqual(['对手', '赔偿档', '用时', '收获', '职级']); // 没带遗物 → 无遗物行
    expect(c.rows.find((r) => r.label === '用时')?.value).toBe('6 回合');
    expect(c.tagline.length).toBeGreaterThan(0);
  });

  it('includes a relic row only when a relic was equipped', () => {
    const c = buildSettlementCard({ ...base, relicName: '录音笔' });
    expect(c.rows.find((r) => r.label === '遗物')?.value).toBe('录音笔');
  });

  it('flipped → lose headline mentions 仲裁/掀桌', () => {
    const c = buildSettlementCard({ ...base, outcomeKind: 'flipped', tier: 0, multiple: '未谈成' });
    expect(c.vibe).toBe('lose');
    expect(c.headline).toContain('掀桌');
    expect(c.rows.find((r) => r.label === '赔偿档')?.value).toBe('未谈成');
  });

  it('caved with a tier shows the multiple', () => {
    const c = buildSettlementCard({ ...base, outcomeKind: 'caved', tier: 1, multiple: 'N+1' });
    expect(c.headline).toContain('N+1');
    expect(c.vibe).toBe('meh');
  });
});
