/**
 * v6.58 — 「裁了么」闯关牌局 HR 台词层纯函数回归。LLM 调用本身不测(要烧额度),
 * 只锁 prompt 组装 / 关系判定 / 收口 / 兜底 这些确定性逻辑。
 */
import { describe, it, expect } from 'vitest';
import {
  buildHRLinePrompt,
  fallbackHRLine,
  relationOf,
  sanitizeHRLine,
} from '../negotiationFlavor';

describe('negotiationFlavor — relationOf', () => {
  it('reads resist / weak / normal off the 克制矩阵', () => {
    expect(relationOf('tenure_push', 'kpi')).toBe('resist'); // kpi resists tenure
    expect(relationOf('labor_law', 'kpi')).toBe('weak'); // kpi weakTo legal
    expect(relationOf('labor_law', 'pie')).toBe('normal'); // pie: emotion/market only
  });

  it('unknown card → normal (never throws)', () => {
    expect(relationOf('nope', 'pie')).toBe('normal');
  });
});

describe('negotiationFlavor — buildHRLinePrompt', () => {
  it('null for an unknown card', () => {
    expect(buildHRLinePrompt({ cardId: 'nope', stanceId: 'pie' })).toBeNull();
  });

  it('weaves card name, stance name and a relation cue into the prompt', () => {
    const built = buildHRLinePrompt({ cardId: 'tenure_push', stanceId: 'kpi' })!;
    expect(built.system).toContain('HR');
    expect(built.prompt).toContain('工龄施压'); // card name
    expect(built.prompt).toContain('甩锅KPI'); // stance name
    expect(built.prompt).toContain('克制'); // resist cue
  });

  it('terminal outcome injects the matching closing cue', () => {
    const flip = buildHRLinePrompt({ cardId: 'tenure_push', stanceId: 'kpi', outcomeKind: 'flipped' })!;
    expect(flip.prompt).toContain('掀桌');
    const settled = buildHRLinePrompt({ cardId: 'tenure_push', stanceId: 'kpi', outcomeKind: 'settled' })!;
    expect(settled.prompt).toContain('松口');
  });
});

describe('negotiationFlavor — sanitizeHRLine', () => {
  it('strips wrapping quotes + collapses whitespace to one line', () => {
    expect(sanitizeHRLine('“就这个数。”')).toBe('就这个数。');
    expect(sanitizeHRLine('  行吧\n\n 到此为止 ')).toBe('行吧 到此为止');
  });

  it('caps the length so the LLM can not run away', () => {
    expect(sanitizeHRLine('啊'.repeat(100)).length).toBe(40);
  });
});

describe('negotiationFlavor — fallbackHRLine', () => {
  it('always returns an in-character line per terminal outcome', () => {
    expect(fallbackHRLine({ cardId: 'tenure_push', stanceId: 'kpi', outcomeKind: 'flipped' })).toContain('仲裁');
    expect(fallbackHRLine({ cardId: 'tenure_push', stanceId: 'kpi', outcomeKind: 'settled' }).length).toBeGreaterThan(0);
    expect(fallbackHRLine({ cardId: 'tenure_push', stanceId: 'kpi', outcomeKind: 'caved' }).length).toBeGreaterThan(0);
  });

  it('reflects the card↔stance relation when ongoing', () => {
    expect(fallbackHRLine({ cardId: 'labor_law', stanceId: 'kpi' })).toContain('松动'); // weak
    expect(fallbackHRLine({ cardId: 'tenure_push', stanceId: 'kpi' })).toContain('滴水不漏'); // resist
  });
});
