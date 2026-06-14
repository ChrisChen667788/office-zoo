/**
 * v6.54 — pure replay digest + round grouping.
 */
import { describe, it, expect } from 'vitest';
import { digestReplay, groupTimelineByRound } from '../replay';
import { GamePhase, type GameEvent } from '../types/game';

function ev(round: number, type: string): GameEvent {
  return { round, phase: GamePhase.FREE_ROAM, type, description: `${type}@${round}`, timestamp: 0 };
}

describe('digestReplay', () => {
  it('counts rounds + each notable event type', () => {
    const tl = [
      ev(0, 'roster_created'),
      ev(1, 'kill'), ev(1, 'vote_out'),
      ev(2, 'protect'), ev(2, 'intercept'), ev(2, 'kill'),
      ev(3, 'vote_out'),
    ];
    expect(digestReplay(tl)).toEqual({ rounds: 3, kills: 2, votedOut: 2, protects: 1, intercepts: 1, defections: 0 });
  });

  it('handles an empty timeline', () => {
    expect(digestReplay([])).toEqual({ rounds: 0, kills: 0, votedOut: 0, protects: 0, intercepts: 0, defections: 0 });
  });

  it('ignores unrelated event types in the tallies', () => {
    const d = digestReplay([ev(1, 'body_found'), ev(1, 'ghost_vote'), ev(1, 'role_action')]);
    expect(d).toEqual({ rounds: 1, kills: 0, votedOut: 0, protects: 0, intercepts: 0, defections: 0 });
  });

  it('v6.88 — 统计 defection(跨司跳槽)次数', () => {
    const tl = [ev(1, 'defection'), ev(2, 'poach_failed'), ev(2, 'defection'), ev(3, 'kill')];
    const d = digestReplay(tl);
    expect(d.defections).toBe(2);   // poach_failed 不计
    expect(d.kills).toBe(1);
  });
});

describe('groupTimelineByRound', () => {
  it('groups events into ascending rounds, preserving order within a round', () => {
    const tl = [ev(1, 'kill'), ev(0, 'roster_created'), ev(1, 'vote_out'), ev(2, 'game_over')];
    const grouped = groupTimelineByRound(tl);
    expect(grouped.map((g) => g.round)).toEqual([0, 1, 2]);
    expect(grouped[1].events.map((e) => e.type)).toEqual(['kill', 'vote_out']);
  });

  it('returns [] for an empty timeline', () => {
    expect(groupTimelineByRound([])).toEqual([]);
  });
});
