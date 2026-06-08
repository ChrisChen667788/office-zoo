/**
 * v6.67 — 群众吐槽弹幕池纯函数回归。按 seed 取词 + 行格式。
 */
import { describe, it, expect } from 'vitest';
import {
  REACTIONS,
  pickReaction,
  reactionLine,
  type ReactionKind,
} from '../data/reactions';

const KINDS: ReactionKind[] = ['kill', 'vote', 'leak', 'survive'];

describe('reactions — pools', () => {
  it('每个 kind 都有非空池,且每条都有 emoji + text', () => {
    for (const k of KINDS) {
      expect(REACTIONS[k].length).toBeGreaterThan(0);
      for (const r of REACTIONS[k]) {
        expect(r.emoji.length).toBeGreaterThan(0);
        expect(r.text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('reactions — pickReaction', () => {
  it('返回对应池里的成员', () => {
    for (const k of KINDS) {
      const r = pickReaction(k, 3);
      expect(REACTIONS[k]).toContainEqual(r);
    }
  });
  it('同 seed 同结果(确定性)', () => {
    expect(pickReaction('kill', 7)).toEqual(pickReaction('kill', 7));
  });
  it('seed 超出长度时按取模回绕', () => {
    const pool = REACTIONS.vote;
    expect(pickReaction('vote', pool.length)).toEqual(pool[0]);
    expect(pickReaction('vote', pool.length + 2)).toEqual(pool[2]);
  });
  it('负 seed 不炸', () => {
    expect(REACTIONS.kill).toContainEqual(pickReaction('kill', -5));
  });
  it('未知 kind 兜底不炸', () => {
    const r = pickReaction('nope' as ReactionKind, 0);
    expect(r.emoji).toBe('🐀');
  });
});

describe('reactions — reactionLine', () => {
  it('拼成「emoji 群众:text」', () => {
    const line = reactionLine('kill', 0);
    expect(line).toContain('群众:');
    expect(line).toContain(REACTIONS.kill[0].emoji);
    expect(line).toContain(REACTIONS.kill[0].text);
  });
});
