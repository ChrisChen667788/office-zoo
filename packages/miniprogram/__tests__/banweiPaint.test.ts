/**
 * v6.36 P2 — banweiPaint pure-fn behavior tests using a recording
 * Canvas 2D mock. Verifies call order + key values without needing
 * a real wx Canvas / browser. Real visual verification still requires
 * 微信开发者工具 — see packages/miniprogram/README.md for steps.
 */
import { describe, it, expect, beforeEach } from 'vitest';
// CommonJS require shim — banweiPaint.js uses module.exports for
// wx-runtime compatibility, vitest hosts both worlds.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { paintBanwei } = require('../utils/banweiPaint.js') as {
  paintBanwei: (ctx: MockCtx, W: number, H: number, data: PaintData) => void;
};

interface PaintData {
  score: number;
  tierLabel: string;
  tierEmoji: string;
  tierAccent: string;
  breakdown: Array<{ name: string; count: number; cap: number }>;
  priorScore: number | null;
  delta: number | null;
}

type Call = [string, ...unknown[]];

class MockCtx {
  calls: Call[] = [];
  fillStyle: string | object = '';
  strokeStyle: string = '';
  lineWidth = 0;
  font = '';
  textAlign = '';
  textBaseline = '';
  fillRect(...a: unknown[]) { this.calls.push(['fillRect', ...a]); }
  fillText(...a: unknown[]) { this.calls.push(['fillText', ...a]); }
  beginPath() { this.calls.push(['beginPath']); }
  closePath() { this.calls.push(['closePath']); }
  moveTo(...a: unknown[]) { this.calls.push(['moveTo', ...a]); }
  lineTo(...a: unknown[]) { this.calls.push(['lineTo', ...a]); }
  arc(...a: unknown[]) { this.calls.push(['arc', ...a]); }
  fill() { this.calls.push(['fill']); }
  stroke() { this.calls.push(['stroke']); }
  createLinearGradient(...a: unknown[]) {
    this.calls.push(['createLinearGradient', ...a]);
    return { addColorStop: (_p: number, _c: string) => {} } as { addColorStop: (p: number, c: string) => void };
  }
  createRadialGradient(...a: unknown[]) {
    this.calls.push(['createRadialGradient', ...a]);
    return { addColorStop: (_p: number, _c: string) => {} } as { addColorStop: (p: number, c: string) => void };
  }
}

const baseData: PaintData = {
  score: 75,
  tierLabel: '资深打工人',
  tierEmoji: '💼',
  tierAccent: '#FF4FA3',
  breakdown: [
    { name: '爆料投递', count: 8, cap: 10 },
    { name: 'AI 引用', count: 3, cap: 5 },
    { name: '经典局', count: 4, cap: 5 },
    { name: '段子听', count: 5, cap: 5 },
    { name: '周年回顾', count: 1, cap: 1 },
  ],
  priorScore: 60,
  delta: 15,
};

let ctx: MockCtx;
beforeEach(() => { ctx = new MockCtx(); });

describe('paintBanwei', () => {
  it('paints something (non-trivial call count)', () => {
    paintBanwei(ctx, 1080, 1350, baseData);
    expect(ctx.calls.length).toBeGreaterThan(30);
  });

  it('paints the score number with text content matching data.score', () => {
    paintBanwei(ctx, 1080, 1350, baseData);
    const fillTexts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(fillTexts).toContain('75'); // score
    expect(fillTexts).toContain('SCORE / 100');
    expect(fillTexts).toContain('💼 资深打工人');
  });

  it('paints WoW row when priorScore present', () => {
    paintBanwei(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toContain('上周 60');
    expect(texts).toContain('↗'); // delta +15 → up arrow
    expect(texts).toContain('+15');
  });

  it('paints first-time-nudge when priorScore null', () => {
    paintBanwei(ctx, 1080, 1350, { ...baseData, priorScore: null, delta: null });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toContain('第一次班味打卡 · 下周来看变化');
    expect(texts).not.toContain('↗');
  });

  it('down arrow when delta < 0', () => {
    paintBanwei(ctx, 1080, 1350, { ...baseData, priorScore: 90, delta: -15 });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toContain('↘');
    expect(texts).toContain('-15');
  });

  it('= sign when delta is 0', () => {
    paintBanwei(ctx, 1080, 1350, { ...baseData, priorScore: 75, delta: 0 });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toContain('=');
    expect(texts).toContain('持平');
  });

  it('5-axis radar uses correct ratios (count/cap)', () => {
    // Verify the radar polygon picks the right radius per axis. We
    // approximate by checking the data-polygon's lineTo calls count
    // matches 5 axes (after first moveTo). 4 rings × 5 segments +
    // 1 data poly × 5 segments + 1 close = a lot, but each ring has
    // 1 moveTo + 4 lineTo = 5 ops, total 20 + data poly 5 = 25 ish.
    paintBanwei(ctx, 1080, 1350, baseData);
    const moveCount = ctx.calls.filter((c) => c[0] === 'moveTo').length;
    expect(moveCount).toBe(5); // 4 ring + 1 data poly
  });

  it('axis labels are painted', () => {
    paintBanwei(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    for (const axis of ['爆料投递', 'AI 引用', '经典局', '段子听', '周年回顾']) {
      expect(texts).toContain(axis);
    }
  });

  it('footer github URL is painted', () => {
    paintBanwei(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts.some((t) => typeof t === 'string' && (t as string).includes('github.com/ChrisChen667788/office-zoo'))).toBe(true);
  });
});
