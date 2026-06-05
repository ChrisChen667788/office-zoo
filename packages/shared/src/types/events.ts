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
  /** v6.39 P3 — user-chosen emoji avatar from a 公司主题包 NPC. Client
   *  renders this glyph in place of the role image when present. */
  avatar?: string;
  /** v6.55 #2 — per-player unique avatar key into the cached avatar pool.
   *  Lets duplicate-role players (e.g. 普通员工 ×2) show distinct faces — the
   *  client resolves avatarUrls[avatarKey ?? role]. */
  avatarKey?: string;
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
  /** v6.25 P1 — spectator-submitted psy-war leak (GhostChatPanel 战术 @
   *  button). Engine appends to leakedHints FIFO buffer (cap 5), surfaces
   *  in next round's discussion prompt as anonymous ex-coworker tip. */
  'game:psy_war_leak': (data: string | { text: string }) => void;
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
  'game:vote_result': (data: {
    votes: Record<string, string>;
    ghostVotes: Record<string, string>;
    eliminated?: string;
    eliminatedRole?: string;
    /** v6.24 P1 — personality of the eliminated player, passed through
     *  so the EliminationReveal can drive the personality-flavored
     *  last-words pool without a stale client-side players.find lookup. */
    eliminatedPersonality?: string;
  }) => void;
  'game:kill': (data: {
    killerId: string;
    victimId: string;
    location: string;
    /** v6.24 P1 — same defensive personality passthrough as vote_result. */
    victimPersonality?: string;
  }) => void;
  /** v6.24 P2 — real-time signal when a single ghost casts their 劳动
   *  仲裁 vote. Lets the client incrementally update the GameMap 👻 N
   *  dot + GhostChatPanel ally tally during voting phase, instead of
   *  waiting for the vote_result batch. */
  'game:ghost_vote_cast': (data: {
    ghostId: string;
    ghostName: string;
    target: string;
  }) => void;
  /** v6.25 P1 — server ack for a psy-war leak. Echoes the trimmed
   *  text + current FIFO size so the client can flash "AI 听到了" on
   *  the corresponding chat bubble. */
  'game:psy_war_acked': (data: { text: string; total: number }) => void;
  /** v6.29 P5 — server rejected a psy-war leak due to rate limit.
   *  Reason 'window_cap' = > 5 leaks in last 60s; retryAfterMs gives
   *  ms until the oldest in-window leak ages out. Reason 'session_cap'
   *  = > 20 leaks total this session (terminal, no retry). Client
   *  should surface as a toast / disable the 战术 @ button briefly. */
  'game:psy_war_rate_limited': (data: { reason: 'window_cap' | 'session_cap'; retryAfterMs: number }) => void;
  /** v6.26 P1 — server detected that this AI speech text quoted one
   *  of the active leakedHints (sliding 4-char substring match). Lets
   *  the client upgrade the GhostChatPanel bubble badge from "👂 AI
   *  听到了" to "✨ AI 引用了" and also highlight the speech itself in
   *  the discussion log. */
  'game:leak_quoted': (data: {
    hintText: string;
    byPlayerId: string;
    byPlayerName: string;
    speechText: string;
  }) => void;
  /** v6.36 P3 — server tells the client which roster names were
   *  hot-nominated this game (≥ 1 hot-quote mention in last 7 days).
   *  GameMap renders a 🔥 badge on those sprites so spectators see
   *  their nominations land. Empty if nobody nominated anyone. */
  'game:hot_names': (data: { names: string[] }) => void;
  'game:avatar_ready': (data: { role: string; team: string; url: string }) => void;
  'game:created': (data: { gameId: string }) => void;
  'game:error': (data: { message: string }) => void;
  'game:over': (data: { winner: WinCondition; reason: string }) => void;
  /** Free-roam tick — fires ~every 1.5s during FREE_ROAM phase only. Carries
   *  the deltas needed to animate movement + activities on the map. Old
   *  clients without a handler silently ignore it. */
  'game:tick': (data: { players: PlayerTickInfo[]; tickAt: number }) => void;
}
