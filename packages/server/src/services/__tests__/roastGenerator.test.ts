/**
 * v6.55 #4 — pure roast prompt-build + line-parse for 班味单口 专属吐槽.
 */
import { describe, it, expect } from 'vitest';
import { buildRoastPrompt, parseRoastLines } from '../roastGenerator';

describe('buildRoastPrompt', () => {
  it('embeds the topic + clamps over-long input', () => {
    expect(buildRoastPrompt('老板画饼')).toContain('老板画饼');
    const long = 'x'.repeat(500);
    expect(buildRoastPrompt(long).length).toBeLessThan(300);
  });
  it('tolerates empty/undefined', () => {
    expect(typeof buildRoastPrompt('')).toBe('string');
    expect(typeof buildRoastPrompt(undefined as unknown as string)).toBe('string');
  });
});

describe('parseRoastLines', () => {
  it('splits into clean lines, stripping numbering + bullets + wrapping quotes', () => {
    const raw = `1. 老板画饼，狼都没他能画\n2、KPI 是你的，饼是他画的\n- "周报写得比项目还长"`;
    expect(parseRoastLines(raw)).toEqual([
      '老板画饼，狼都没他能画',
      'KPI 是你的，饼是他画的',
      '周报写得比项目还长', // wrapping quotes stripped
    ]);
  });

  it('drops meta / preamble lines', () => {
    const raw = `以下是几句吐槽：\n好的，给你来几句\n摸鱼一时爽，一直摸鱼一直爽`;
    expect(parseRoastLines(raw)).toEqual(['摸鱼一时爽，一直摸鱼一直爽']);
  });

  it('caps at 5 lines', () => {
    const raw = Array.from({ length: 9 }, (_, i) => `第${i}句吐槽`).join('\n');
    expect(parseRoastLines(raw)).toHaveLength(5);
  });

  it('clamps over-long lines with an ellipsis', () => {
    const out = parseRoastLines('啊'.repeat(120));
    expect(out[0].length).toBeLessThanOrEqual(60);
    expect(out[0].endsWith('…')).toBe(true);
  });

  it('returns [] for empty input', () => {
    expect(parseRoastLines('')).toEqual([]);
  });
});
