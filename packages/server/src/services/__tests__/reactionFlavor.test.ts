/**
 * v6.69 — 群众吐槽 LLM 层纯函数回归(prompt 组装 / 收口 / 静态池兜底)。
 */
import { describe, it, expect } from 'vitest';
import {
  buildReactionPrompt,
  sanitizeReactionLine,
  fallbackReactionLine,
} from '../reactionFlavor';

describe('reactionFlavor — buildReactionPrompt', () => {
  it('把当局上下文塞进 prompt(名字/身份/性格/动手人)', () => {
    const built = buildReactionPrompt({
      kind: 'vote', victimName: 'Tony', victimRole: '数据分析师', victimPersonality: '卷王', byName: 'Lisa',
    });
    expect(built).not.toBeNull();
    expect(built!.prompt).toContain('Tony');
    expect(built!.prompt).toContain('数据分析师');
    expect(built!.prompt).toContain('卷王');
    expect(built!.prompt).toContain('Lisa');
    expect(built!.prompt).toContain('投票'); // vote 的 KIND_CUE
    expect(built!.system.length).toBeGreaterThan(0);
  });
  it('kill 与 vote 用不同的情景提示', () => {
    const k = buildReactionPrompt({ kind: 'kill', victimName: 'A' })!;
    const v = buildReactionPrompt({ kind: 'vote', victimName: 'A' })!;
    expect(k.prompt).toContain('优化');
    expect(v.prompt).toContain('投票');
  });
  it('空名字 → null(走兜底)', () => {
    expect(buildReactionPrompt({ kind: 'kill', victimName: '   ' })).toBeNull();
  });
});

describe('reactionFlavor — sanitizeReactionLine', () => {
  it('去引号/折行,夹到 ≤30 字', () => {
    expect(sanitizeReactionLine('“这瓜  保熟”')).toBe('这瓜 保熟');
    expect(sanitizeReactionLine('a'.repeat(50)).length).toBe(30);
  });
  it('去掉开头的 @某人', () => {
    expect(sanitizeReactionLine('@Tony 又一个卷王倒下')).toBe('又一个卷王倒下');
  });
});

describe('reactionFlavor — fallbackReactionLine', () => {
  it('回退到静态池(带 emoji),确定性', () => {
    const a = fallbackReactionLine({ kind: 'kill', victimName: 'Tony' });
    const b = fallbackReactionLine({ kind: 'kill', victimName: 'Tony' });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1);
  });
});
