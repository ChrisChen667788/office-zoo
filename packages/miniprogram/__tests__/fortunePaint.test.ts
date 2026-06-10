/**
 * v6.79 — fortunePaint 纯函数回归(班味占卜小程序海报)。
 * 跟 banweiPaint.test.ts 同一套 recording-mock 套路:不需要真 wx Canvas,
 * 断言关键字符串/调用形态。真视觉验证仍需微信开发者工具(见 mp README)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { paintFortune, vibeTier, wrapCn } = require('../utils/fortunePaint.js') as {
  paintFortune: (ctx: MockCtx, W: number, H: number, data: PaintData) => void;
  vibeTier: (score: number) => { label: string; color: string };
  wrapCn: (text: string, n: number, maxLines?: number) => string[];
};

interface PaintData {
  date: string; emoji: string; title: string; subtitle: string;
  vibeScore: number; gradient: [string, string];
  advice: string; microAction: string;
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
}

const baseData: PaintData = {
  date: '2026-06-10',
  emoji: '🌖',
  title: '隐身大吉',
  subtitle: '今天不要主动出现在老板视野里',
  vibeScore: 72,
  gradient: ['#3b1f6e', '#0e0a2a'],
  advice: '今晚不要打开 BOSS 直聘/投简历/算公积金,那些事明早再说。',
  microAction: '11 点之前关手机,听一首老歌(但不要听виа歌)。',
};

let ctx: MockCtx;
beforeEach(() => { ctx = new MockCtx(); });

describe('vibeTier', () => {
  it('分段与 H5 端一致(80/60/40/20)', () => {
    expect(vibeTier(85).label).toBe('大吉');
    expect(vibeTier(72).label).toBe('小吉');
    expect(vibeTier(45).label).toBe('中平');
    expect(vibeTier(25).label).toBe('小凶');
    expect(vibeTier(5).label).toBe('大凶');
  });
});

describe('wrapCn', () => {
  it('按字数切行', () => {
    expect(wrapCn('一二三四五六', 3)).toEqual(['一二三', '四五六']);
  });
  it('超过 maxLines 截断 + 省略号', () => {
    const lines = wrapCn('一二三四五六七八九十', 3, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });
  it('空串安全', () => {
    expect(wrapCn('', 5)).toEqual([]);
  });
});

describe('paintFortune', () => {
  it('画了足够多东西(非空实现)', () => {
    paintFortune(ctx, 1080, 1350, baseData);
    expect(ctx.calls.length).toBeGreaterThan(15);
  });

  it('牌面要素都在:emoji / 标题 / 副标题 / 档位+分', () => {
    paintFortune(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toContain('🌖');
    expect(texts).toContain('隐身大吉');
    expect(texts).toContain('今天不要主动出现在老板视野里');
    expect(texts).toContain('小吉 · 运势 72'); // 72 → 小吉
  });

  it('忠告/微行动按 28 字换行后逐行画出', () => {
    paintFortune(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
    const adviceLines = wrapCn(baseData.advice, 28, 3);
    for (const line of adviceLines) expect(texts).toContain(line);
    expect(texts).toContain('✦ 今日忠告');
    expect(texts).toContain('✦ 5 分钟微行动');
  });

  it('日期戳 + 仓库 footer 都画了', () => {
    paintFortune(ctx, 1080, 1350, baseData);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
    expect(texts.some((t) => t.includes('2026-06-10'))).toBe(true);
    expect(texts.some((t) => t.includes('github.com/ChrisChen667788/office-zoo'))).toBe(true);
  });

  it('运势条宽度按分数比例(72% 满宽)', () => {
    paintFortune(ctx, 1080, 1350, baseData);
    const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
    const barW = 1080 - 112;
    const expected = barW * 72 / 100;
    expect(rects.some((r) => Math.abs((r[3] as number) - expected) < 0.5)).toBe(true);
  });
});
