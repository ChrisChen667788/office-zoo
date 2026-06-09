/**
 * v6.73 — highlightPicker 名场面识别回归。重点验证新增的 4 种高戏剧性名场面
 * (reversal / perfect_bluff / comeback / bloodbath)从已有日志正确挖出 + 排序压过普通击杀。
 */
import { describe, it, expect } from 'vitest';
import { pickHighlights, type HighlightPickInput } from '../highlightPicker';
import type { GamePlayer, EliminationLogEntry, PredictionLogEntry } from '../../stores/gameStore';

function player(p: Partial<GamePlayer> & { id: string; name: string }): GamePlayer {
  return { isAlive: true, ...p } as GamePlayer;
}
function elim(e: Partial<EliminationLogEntry> & { playerId: string; playerName: string }): EliminationLogEntry {
  return { id: 1, round: 1, type: 'vote', timestamp: 0, ...e } as EliminationLogEntry;
}
function base(over: Partial<HighlightPickInput>): HighlightPickInput {
  return {
    players: [player({ id: 'a', name: 'Tony' })],
    eliminationLog: [],
    speeches: [],
    winner: 'cat',
    totalRounds: 4,
    ...over,
  };
}
const kinds = (input: HighlightPickInput) => pickHighlights(input, 8).map((h) => h.kind);

describe('highlightPicker — 反转(看走眼)', () => {
  it('押错的预测 → reversal,且文案带押注/实际两个名字', () => {
    const predictionLog: PredictionLogEntry[] = [
      { round: 3, pickId: 'a', pickName: 'Tony', actualId: 'b', actualName: 'Lisa', correct: false },
    ];
    const out = pickHighlights(base({ predictionLog }), 8);
    const rev = out.find((h) => h.kind === 'reversal');
    expect(rev).toBeTruthy();
    expect(rev!.body).toContain('Tony');
    expect(rev!.body).toContain('Lisa');
  });
  it('押对的预测不产出 reversal', () => {
    const predictionLog: PredictionLogEntry[] = [
      { round: 2, pickId: 'b', pickName: 'Lisa', actualId: 'b', actualName: 'Lisa', correct: true },
    ];
    expect(kinds(base({ predictionLog }))).not.toContain('reversal');
  });
});

describe('highlightPicker — 完美伪装', () => {
  it('资本家(dog)赢 + 有存活且没被票出的 dog → perfect_bluff,并排在普通击杀前', () => {
    const input = base({
      winner: 'dog',
      players: [player({ id: 'a', name: 'Tony', team: 'dog', isAlive: true }), player({ id: 'b', name: 'Lisa', team: 'cat', isAlive: false })],
      eliminationLog: [elim({ playerId: 'b', playerName: 'Lisa', team: 'cat', type: 'kill', round: 2 })],
    });
    const out = pickHighlights(input, 8);
    const bluff = out.find((h) => h.kind === 'perfect_bluff');
    expect(bluff).toBeTruthy();
    expect(bluff!.playerName).toBe('Tony');
    // 压过普通击杀:perfect_bluff 应排在 kill 之前
    expect(out.findIndex((h) => h.kind === 'perfect_bluff')).toBeLessThan(out.findIndex((h) => h.kind === 'kill'));
  });
  it('打工人赢则不产出 perfect_bluff', () => {
    expect(kinds(base({ winner: 'cat' }))).not.toContain('perfect_bluff');
  });
});

describe('highlightPicker — 绝地翻盘', () => {
  it('赢家折损 ≥2 且 ≥ 对家 → comeback', () => {
    const input = base({
      winner: 'cat',
      eliminationLog: [
        elim({ playerId: 'a', playerName: 'A', team: 'cat', round: 1 }),
        elim({ playerId: 'b', playerName: 'B', team: 'cat', round: 2 }),
        elim({ playerId: 'c', playerName: 'C', team: 'dog', round: 3 }),
      ],
    });
    expect(kinds(input)).toContain('comeback');
  });
  it('赢家没怎么折损则不产出 comeback', () => {
    const input = base({ winner: 'cat', eliminationLog: [elim({ playerId: 'c', playerName: 'C', team: 'dog' })] });
    expect(kinds(input)).not.toContain('comeback');
  });
});

describe('highlightPicker — 腥风血雨', () => {
  it('同一回合 ≥2 人出局 → bloodbath,锁定那个回合', () => {
    const input = base({
      eliminationLog: [
        elim({ playerId: 'a', playerName: 'A', round: 2 }),
        elim({ playerId: 'b', playerName: 'B', round: 2 }),
      ],
    });
    const bb = pickHighlights(input, 8).find((h) => h.kind === 'bloodbath');
    expect(bb).toBeTruthy();
    expect(bb!.round).toBe(2);
  });
});

describe('highlightPicker — 结尾帧', () => {
  it('finale 永远在最后一帧', () => {
    const out = pickHighlights(base({ eliminationLog: [elim({ playerId: 'a', playerName: 'A' })] }), 8);
    expect(out[out.length - 1].kind).toBe('finale');
  });
});
