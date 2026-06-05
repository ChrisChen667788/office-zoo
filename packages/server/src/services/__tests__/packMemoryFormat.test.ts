/**
 * v6.51 P1 — pure cross-game pack-memory formatting.
 *
 * Covers summarizeWinner (WinCondition → faction label) and
 * formatPackMemoryForNpc (a pack's game history → a per-NPC prompt
 * snippet). The store + engine wiring is integration-tested elsewhere;
 * here we pin the pure text logic so grudge snippets stay correct.
 */
import { describe, it, expect } from 'vitest';
import { WinCondition } from '@furball/shared';
import {
  summarizeWinner,
  formatPackMemoryForNpc,
  MAX_PACK_RECALL,
  type PackGameMemory,
} from '../packMemoryFormat';

function game(over: Partial<PackGameMemory>): PackGameMemory {
  return {
    ts: 0,
    winnerLabel: '打工人',
    survivors: [],
    eliminated: [],
    roster: [],
    ...over,
  };
}

describe('summarizeWinner', () => {
  it('maps each win condition to its faction label', () => {
    expect(summarizeWinner(WinCondition.CAT_WIN)).toBe('资本家(管理层)');
    expect(summarizeWinner(WinCondition.DOG_WIN)).toBe('打工人');
    expect(summarizeWinner(WinCondition.NEUTRAL_WIN)).toBe('摸鱼人');
    expect(summarizeWinner(WinCondition.NONE)).toBe('未分胜负');
  });
});

describe('formatPackMemoryForNpc', () => {
  it('returns "" for no history', () => {
    expect(formatPackMemoryForNpc('阿强', [])).toBe('');
    expect(formatPackMemoryForNpc('阿强', undefined)).toBe('');
  });

  it('returns "" when the NPC never appeared in any stored game', () => {
    const mem = [game({ roster: ['小王', '小李'], survivors: ['小王'] })];
    expect(formatPackMemoryForNpc('阿强', mem)).toBe('');
  });

  it('reports survival + winning faction for a single game', () => {
    const mem = [
      game({ roster: ['阿强', '小王'], survivors: ['阿强'], winnerLabel: '打工人' }),
    ];
    const out = formatPackMemoryForNpc('阿强', mem);
    expect(out).toContain('最近一局');
    expect(out).toContain('你活到了最后');
    expect(out).toContain('赢家是打工人阵营');
    expect(out).toContain('1 次手');
  });

  it('reports elimination when the NPC was not a survivor', () => {
    const mem = [
      game({ roster: ['阿强', '小王'], survivors: ['小王'], eliminated: ['阿强'] }),
    ];
    expect(formatPackMemoryForNpc('阿强', mem)).toContain('你那局被裁了');
  });

  it('orders newest-first (最近一局 = last stored game)', () => {
    const mem = [
      game({ roster: ['阿强'], survivors: [], eliminated: ['阿强'] }), // older: eliminated
      game({ roster: ['阿强'], survivors: ['阿强'] }), // newest: survived
    ];
    const out = formatPackMemoryForNpc('阿强', mem);
    const recent = out.indexOf('最近一局');
    const prev = out.indexOf('上一局');
    expect(recent).toBeGreaterThan(-1);
    expect(prev).toBeGreaterThan(recent); // 最近一局 appears before 上一局
    // 最近一局 line should be the "survived" one.
    const recentLine = out.slice(recent, prev);
    expect(recentLine).toContain('你活到了最后');
  });

  it('caps recall at MAX_PACK_RECALL games', () => {
    const many = Array.from({ length: MAX_PACK_RECALL + 3 }, () =>
      game({ roster: ['阿强'], survivors: ['阿强'] }),
    );
    const out = formatPackMemoryForNpc('阿强', many);
    const bulletCount = (out.match(/^· /gm) || []).length;
    expect(bulletCount).toBe(MAX_PACK_RECALL);
  });

  it('only counts games the NPC actually played in the intro tally', () => {
    const mem = [
      game({ roster: ['小王'], survivors: ['小王'] }), // 阿强 absent
      game({ roster: ['阿强'], survivors: ['阿强'] }), // 阿强 present
    ];
    expect(formatPackMemoryForNpc('阿强', mem)).toContain('1 次手');
  });
});
