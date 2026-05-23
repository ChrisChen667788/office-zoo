import { GamePhase, WinCondition, Activity, PlayerPosition, CarriedItem } from './game';

// Serialized player state sent to client (includes role/team for rendering)
export interface SerializedPlayer {
  id: string;
  name: string;
  isAlive: boolean;
  /** Position now includes optional `pathProgress` + `destination` for the
   *  new free-roam tick system. Old clients ignore the extra fields and
   *  render the player at the room centre, same as before. */
  position: PlayerPosition;
  /** Current activity — optional so old clients without the free-roam layer
   *  silently ignore it. */
  activity?: Activity;
  /** Pre-formatted activity caption — optional for the same reason. */
  activityText?: string;
  /** v0.6.2 — what the player is currently holding (cup / folder / etc).
   *  Optional → null when empty-handed. Old clients ignore. */
  carrying?: CarriedItem | null;
  role?: string;
  team?: string;
  tasksCompleted: number;
  totalTasks: number;
  /** 离职员工是否已用完劳动仲裁投票 */
  ghostVoteUsed: boolean;
  /** AI 人格类型 */
  personality?: string;
}

/** Lightweight per-tick payload sent at ~1.5s cadence during free_roam.
 *  Only the fields that change every tick — saves ~70% of bandwidth vs
 *  re-broadcasting the full SerializedGameState each cycle. */
export interface PlayerTickInfo {
  id: string;
  position: PlayerPosition;
  activity?: Activity;
  activityText?: string;
  /** v0.6.2 — carried item, refreshed each tick. */
  carrying?: CarriedItem | null;
}

export interface SerializedGameState {
  id: string;
  phase: GamePhase;
  players: SerializedPlayer[];
  round: number;
  taskProgress: number;
  winner: WinCondition;
  votes: Record<string, string>;
  /** 离职员工的劳动仲裁投票 */
  ghostVotes: Record<string, string>;
}

/**
 * v6.8 P4.1 — evidence reference.
 *
 * When the LLM mentions another player in its speech, the server-side
 * parser (see socketHandler:emitSpeechWithEvidence) scans for the
 * mentioned name in the prior speeches of THIS round and emits an
 * EvidenceRef so the client can render a "↳ 引用 Tony" chip + jump-to
 * affordance.
 *
 * `refToTextSnippet` is a ≤ 40-char excerpt of the referenced speech —
 * enough to give context in the chip tooltip without re-emitting the
 * full speech. The full text is already in the client's speechHistory
 * keyed by `refToPlayerId`.
 *
 * `kind` tracks how confidence the parser was:
 *   - `mention`  → the name appears verbatim ("@Tony" or "Tony 同学")
 *   - `at_tag`   → explicit @ prefix ("@Tony")
 *   - `fuzzy`    → the name appears in a less-direct form ("某位说颗粒度的同学")
 *
 * Multiple evidence refs per speech are allowed; the client renders them
 * as a horizontal chip strip.
 */
export interface EvidenceRef {
  refToPlayerId: string;
  refToPlayerName: string;
  refToTextSnippet: string;
  kind: 'mention' | 'at_tag' | 'fuzzy';
}

/** 离职员工弹幕吐槽 */
export interface GhostComment {
  playerId: string;
  playerName: string;
  text: string;
  role?: string;
  team?: string;
}

// Client → Server events
export interface ClientToServerEvents {
  'game:create': (config: { playerCount: number; mode: string }) => void;
  'game:start': (gameId: string) => void;
  'game:join': (gameId: string) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  'game:state': (state: SerializedGameState) => void;
  'game:phase_change': (data: { phase: GamePhase; round: number }) => void;
  'game:speech_start': (data: { playerId: string; playerName: string }) => void;
  /**
   * v6.8 P4.2 — discussion playback progress. Emitted immediately before
   * each `game:speech_start` event so the client can render a wave
   * progress bar without inventing a fake countdown. `current` is 1-based
   * (first speech = 1), `total` = full speech queue size for the round.
   * The last 2 indices (current >= total - 1) are the "pressure window"
   * — client renders red pulse + plays sfx.playTick(). Optional payload
   * — back-compat with clients that don't subscribe.
   */
  'game:discussion_progress': (data: { current: number; total: number; round: number }) => void;
  'game:speech': (data: { playerId: string; playerName: string; text: string; role?: string; team?: string; evidence?: EvidenceRef[] }) => void;
  'game:speech_audio': (data: { playerId: string; audioUrl: string }) => void;
  'game:speech_end': (data: { playerId: string }) => void;
  'game:ghost_comment': (data: GhostComment) => void;
  'game:vote_result': (data: { votes: Record<string, string>; ghostVotes: Record<string, string>; eliminated?: string; eliminatedRole?: string }) => void;
  'game:kill': (data: { killerId: string; victimId: string; location: string }) => void;
  'game:avatar_ready': (data: { role: string; team: string; url: string }) => void;
  'game:created': (data: { gameId: string }) => void;
  'game:error': (data: { message: string }) => void;
  'game:over': (data: { winner: WinCondition; reason: string }) => void;
  /** Free-roam tick — fires ~every 1.5s during FREE_ROAM phase only. Carries
   *  the deltas needed to animate movement + activities on the map. Old
   *  clients without a handler silently ignore it. */
  'game:tick': (data: { players: PlayerTickInfo[]; tickAt: number }) => void;
}
