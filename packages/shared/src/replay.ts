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
import type { CompanyId, DualEndReason, MarketState } from './dual/dual';

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
  /** v6.88 — 双公司归属(单公司局 undefined;跳槽后是终局所在司)。 */
  companyId?: CompanyId;
}

/** v6.168 — 回放里的一条发言。byHuman = 真人占座玩家打的字(用户内容,不得进公开示例)。 */
export interface ReplaySpeech {
  round: number;
  playerId: string;
  playerName: string;
  text: string;
  role?: string;
  team?: string;
  byHuman?: boolean;
}

/** 回放最多保留多少条发言(防止长局把 replays.json 撑大)。 */
export const REPLAY_MAX_SPEECHES = 240;
/** 单条发言最多保留多少字。 */
export const REPLAY_MAX_SPEECH_CHARS = 400;

/** 截断 / 限量,只留需要的字段。纯函数。 */
export function compactReplaySpeeches(list: ReadonlyArray<ReplaySpeech>): ReplaySpeech[] {
  return list.slice(-REPLAY_MAX_SPEECHES).map((s) => ({
    round: s.round,
    playerId: s.playerId,
    playerName: s.playerName,
    text: [...s.text].slice(0, REPLAY_MAX_SPEECH_CHARS).join(''),
    ...(s.role ? { role: s.role } : {}),
    ...(s.team ? { team: s.team } : {}),
    ...(s.byHuman ? { byHuman: true } : {}),
  }));
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
  // v6.88 — 双公司局快照(单公司局这三项 undefined,老回放向后兼容)。
  mode?: 'single' | 'dual';
  /** 终局市占率。 */
  market?: MarketState;
  /** 终局缘由(垄断/团灭/双鬼皆裁/回合上限)。 */
  dualReason?: DualEndReason;
  /** v6.168 — 讨论阶段的发言(老回放没有)。 */
  speeches?: ReplaySpeech[];
  /** v6.168 — 随仓库发布的示例对局(不调模型、不需要 key 就能看)。 */
  sample?: boolean;
}

export interface ReplayDigest {
  rounds: number;
  kills: number;
  votedOut: number;
  protects: number;
  intercepts: number;
  /** v6.88 — 跨司跳槽次数(双公司局的招牌时刻)。 */
  defections: number;
}

/** Compact stats over a timeline — for the recent-replays list preview and
 *  the replay header. Pure. */
export function digestReplay(timeline: GameEvent[]): ReplayDigest {
  const d: ReplayDigest = { rounds: 0, kills: 0, votedOut: 0, protects: 0, intercepts: 0, defections: 0 };
  for (const e of timeline) {
    if (e.round > d.rounds) d.rounds = e.round;
    switch (e.type) {
      case 'kill': d.kills++; break;
      case 'vote_out': d.votedOut++; break;
      case 'protect': d.protects++; break;
      case 'intercept': d.intercepts++; break;
      case 'defection': d.defections++; break;
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

/** v6.168 — 按回合合并事件与发言(只有发言、没有事件的回合也保留)。纯函数。 */
export function groupReplayByRound(
  timeline: GameEvent[],
  speeches: ReadonlyArray<ReplaySpeech> = [],
): Array<{ round: number; events: GameEvent[]; speeches: ReplaySpeech[] }> {
  const rounds = new Map<number, { events: GameEvent[]; speeches: ReplaySpeech[] }>();
  const slot = (r: number) => {
    let g = rounds.get(r);
    if (!g) { g = { events: [], speeches: [] }; rounds.set(r, g); }
    return g;
  };
  for (const e of timeline) slot(e.round).events.push(e);
  for (const s of speeches) slot(s.round).speeches.push(s);
  return [...rounds.keys()].sort((a, b) => a - b).map((round) => ({ round, ...rounds.get(round)! }));
}
