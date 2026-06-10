/**
 * v6.80 — weeklyPaint 纯函数回归(周报 4 风格 2×2 海报)。
 * banwei/fortune 同一套 recording-mock 套路;真视觉验证走浏览器 Canvas probe。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { paintWeekly, paletteOf, STYLE_PALETTE } = require('../utils/weeklyPaint.js') as {
  paintWeekly: (ctx: MockCtx, W: number, H: number, data: PaintData) => void;
  paletteOf: (style: string) => { from: string; to: string; accent: string };
  STYLE_PALETTE: Record<string, { from: string; to: string; accent: string }>;
};

interface PaintData {
  event: string;
  results: Array<{ style: string; label: string; emoji: string; text: string }>;
}

type Call = [string, ...unknown[]];

class MockCtx {
  calls: Call[] = [];
  fillStyle: string | object = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign = '';
  textBaseline = '';
  fillRect(...a: unknown[]) { this.calls.push(['fillRect', ...a]); }
  fillText(...a: unknown[]) { this.calls.push(['fillText', ...a]); }
  createLinearGradient(...a: unknown[]) {
    this.calls.push(['createLinearGradient', ...a]);
    return { addColorStop: (_p: number, _c: string) => {} };
  }
  createRadialGradient(...a: unknown[]) {
    this.calls.push(['createRadialGradient', ...a]);
    return { addColorStop: (_p: number, _c: string) => {} };
  }
}

const baseData: PaintData = {
  event: '本周 OKR 没过,因为甲方需求改了 3 次,周五还被拉去救别组的火。',
  results: [
    { style: 'alibaba', label: '阿里黑话版', emoji: '🧩', text: '本周对齐了甲方颗粒度,沉淀了三次需求迭代的方法论,赋能兄弟团队完成救火闭环。' },
    { style: 'pua', label: 'PUA 版', emoji: '🎭', text: '需求改三次就扛不住了?是你心力不够。别组救火是给你机会,格局打开。' },
    { style: 'posh', label: '装腔版', emoji: '🎩', text: '复盘本周,我在不确定性中践行了长期主义,于混沌中重塑了交付的确定性。' },
    { style: 'direct', label: '直球版', emoji: '💢', text: '没干完。甲方改了 3 次需求,周五还被拉去救别组的火,时间全没了。' },
  ],
};

let ctx: MockCtx;
beforeEach(() => { ctx = new MockCtx(); });

describe('paletteOf', () => {
  it('四风格配色与 H5 weeklyShareCard 同源,未知风格回退灰', () => {
    expect(paletteOf('alibaba').accent).toBe('#4ECDC4');
    expect(paletteOf('pua').accent).toBe('#FF4FA3');
    expect(paletteOf('posh').accent).toBe('#FFD700');
    expect(paletteOf('direct').accent).toBe('#FF6B35');
    expect(paletteOf('???').accent).toBe('#aaaaaa');
    expect(Object.keys(STYLE_PALETTE)).toHaveLength(4);
  });
});

describe('paintWeekly', () => {
  it('画了足够多东西(非空实现)', () => {
    paintWeekly(ctx, 1080, 1350, baseData);
    expect(ctx.calls.length).toBeGreaterThan(30);
  });

  it('要素都在:标语 / 事件行 / 4 个风格标签 / footer 话题', () => {
    paintWeekly(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
    expect(texts).toContain('✦ 同一件事 · 4 种说法');
    expect(texts).toContain('— 本周关键事件 —');
    for (const label of ['阿里黑话版', 'PUA 版', '装腔版', '直球版']) {
      expect(texts).toContain(label);
    }
    expect(texts).toContain('#周报生成器');
    expect(texts.some((t) => t.includes('github.com/ChrisChen667788/office-zoo'))).toBe(true);
  });

  it('事件文本被换行后画出(首行可寻)', () => {
    paintWeekly(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
    expect(texts.some((t) => baseData.event.startsWith(t.slice(0, 8)) && t.length > 4)).toBe(true);
  });

  it('每张卡有顶部渐变色条(4 条 linearGradient 之外还有 footer 无关)', () => {
    paintWeekly(ctx, 1080, 1350, baseData);
    // 每卡 1 条 strip 渐变 → 至少 4 次 createLinearGradient
    const lg = ctx.calls.filter((c) => c[0] === 'createLinearGradient');
    expect(lg.length).toBeGreaterThanOrEqual(4);
  });

  it('只画前 4 条结果(传 5 条不越界)', () => {
    const five = { ...baseData, results: [...baseData.results, { style: 'alibaba', label: '多余卡', emoji: '❌', text: 'x' }] };
    paintWeekly(ctx, 1080, 1350, five);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
    expect(texts).not.toContain('多余卡');
  });

  it('空结果不崩(只画框架)', () => {
    paintWeekly(ctx, 1080, 1350, { event: '空跑一周', results: [] });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
    expect(texts).toContain('✦ 同一件事 · 4 种说法');
  });
});
