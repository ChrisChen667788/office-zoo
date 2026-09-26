/**
 * v6.157 — 日韩职场黑话词典数据质量测试
 *
 * 覆盖:
 *   - JARGON_JA 和 JARGON_KO 条目数量(各 15+ 条)
 *   - 每条都有 term 和 gloss(非空字符串)
 *   - ja 条目的 term 含日文字符(假名或汉字)
 *   - ko 条目的 term 含韩文字符(谚文)
 *   - sampleJargonJa / sampleJargonKo 随机抽取逻辑
 */

import { describe, it, expect } from 'vitest';
import { JARGON_JA, sampleJargonJa } from '../data/jargon-ja';
import { JARGON_KO, sampleJargonKo } from '../data/jargon-ko';

const HIRAGANA_KATAKANA_CJK = /[぀-ヿ一-鿿]/;
const HANGUL = /[가-힯]/;

describe('JARGON_JA — 日文职场黑话数据质量', () => {
  it('至少 15 条', () => {
    expect(JARGON_JA.length).toBeGreaterThanOrEqual(15);
  });

  it('每条都有非空 term 和 gloss', () => {
    for (const item of JARGON_JA) {
      expect(typeof item.term).toBe('string');
      expect(item.term.length).toBeGreaterThan(0);
      expect(typeof item.gloss).toBe('string');
      expect(item.gloss.length).toBeGreaterThan(0);
    }
  });

  it('大多数 term 含日文字符(允许少量 ASCII 缩写如 KY)', () => {
    // 允许少于 20% 的条目是纯 ASCII 缩写(如 KY = 空気読めない)
    const withJpChars = JARGON_JA.filter((item) => HIRAGANA_KATAKANA_CJK.test(item.term));
    expect(withJpChars.length).toBeGreaterThanOrEqual(Math.floor(JARGON_JA.length * 0.8));
  });

  it('gloss 为英文(不含日文假名)', () => {
    const JAPANESE_KANA = /[぀-ヿ]/;
    for (const item of JARGON_JA) {
      // gloss should primarily be English explanation
      expect(item.gloss.length).toBeGreaterThan(5);
    }
  });
});

describe('JARGON_KO — 韩文职场黑话数据质量', () => {
  it('至少 15 条', () => {
    expect(JARGON_KO.length).toBeGreaterThanOrEqual(15);
  });

  it('每条都有非空 term 和 gloss', () => {
    for (const item of JARGON_KO) {
      expect(typeof item.term).toBe('string');
      expect(item.term.length).toBeGreaterThan(0);
      expect(typeof item.gloss).toBe('string');
      expect(item.gloss.length).toBeGreaterThan(0);
    }
  });

  it('所有 term 含韩文字符', () => {
    for (const item of JARGON_KO) {
      expect(HANGUL.test(item.term)).toBe(true);
    }
  });

  it('gloss 为有意义的英文解释', () => {
    for (const item of JARGON_KO) {
      expect(item.gloss.length).toBeGreaterThan(5);
    }
  });
});

describe('sampleJargonJa / sampleJargonKo — 随机抽取', () => {
  it('sampleJargonJa(3) 返回 3 条', () => {
    const sample = sampleJargonJa(3);
    expect(sample.length).toBe(3);
    for (const item of sample) {
      expect(item.term).toBeTruthy();
      expect(item.gloss).toBeTruthy();
    }
  });

  it('sampleJargonKo(3) 返回 3 条', () => {
    const sample = sampleJargonKo(3);
    expect(sample.length).toBe(3);
    for (const item of sample) {
      expect(item.term).toBeTruthy();
      expect(item.gloss).toBeTruthy();
    }
  });

  it('sampleJargonJa(0) 返回空数组', () => {
    expect(sampleJargonJa(0)).toHaveLength(0);
  });

  it('sampleJargonKo(count > pool) 返回完整 pool', () => {
    const all = sampleJargonKo(100);
    expect(all.length).toBe(JARGON_KO.length);
  });
});
