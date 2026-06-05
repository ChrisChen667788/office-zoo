/**
 * replay — v6.54 — shared types + pure helpers for 🎬 对局回放 (match replay).
 *
 * A finished game is persisted server-side (replayStore) as a ReplayRecord:
 * the final revealed roster + the full event timeline. The client re-renders
 * it as a chronological recap. The digest/group helpers are pure so both the
 * server (list previews) and the client (round-grouped render) reuse them,
 * and they're unit-tested without a running game.
 */
import type { GameEvent, WinCondition } from './types/game';

export interface ReplayPlayer {
  id: string;
  name: string;
  /** Role/team are optional to mirror SerializedPlayer; at GAME_OVER they're
   *  always present (revealed), but the type stays defensive. */
  role?: string;
  team?: string;
  /** Alive at GAME_OVER (i.e. a survivor). */
  isAlive: boolean;
  personality?: string;
  avatar?: string;
}

export interface ReplayRecord {
  gameId: string;
  /** Unix ms the game ended. */
  endedAt: number;
  winner: WinCondition;
  rounds: number;
  players: ReplayPlayer[];
  /** Full event timeline — each GameEvent carries its own round + phase. */
  timeline: GameEvent[];
}

export interface ReplayDigest {
  rounds: number;
  kills: number;
  votedOut: number;
  protects: number;
  intercepts: number;
}

/** Compact stats over a timeline — for the recent-replays list preview and
 *  the replay header. Pure. */
export function digestReplay(timeline: GameEvent[]): ReplayDigest {
  const d: ReplayDigest = { rounds: 0, kills: 0, votedOut: 0, protects: 0, intercepts: 0 };
  for (const e of timeline) {
    if (e.round > d.rounds) d.rounds = e.round;
    switch (e.type) {
      case 'kill': d.kills++; break;
      case 'vote_out': d.votedOut++; break;
      case 'protect': d.protects++; break;
      case 'intercept': d.intercepts++; break;
      default: break;
    }
  }
  return d;
}

/** Group a timeline into ascending rounds for the replay render. Round 0
 *  (pre-game setup events) is kept as its own leading group. Pure. */
export function groupTimelineByRound(timeline: GameEvent[]): Array<{ round: number; events: GameEvent[] }> {
  const byRound = new Map<number, GameEvent[]>();
  for (const e of timeline) {
    const list = byRound.get(e.round);
    if (list) list.push(e);
    else byRound.set(e.round, [e]);
  }
  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => ({ round, events: byRound.get(round)! }));
}
