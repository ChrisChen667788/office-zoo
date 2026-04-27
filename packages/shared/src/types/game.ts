export enum Team {
  CAT = 'cat',
  DOG = 'dog',
  NEUTRAL = 'neutral'
}

export enum GamePhase {
  LOBBY = 'lobby',
  ROLE_REVEAL = 'role_reveal',
  FREE_ROAM = 'free_roam',
  MEETING = 'meeting',
  DISCUSSION = 'discussion',
  VOTING = 'voting',
  VOTE_RESULT = 'vote_result',
  GAME_OVER = 'game_over'
}

export enum WinCondition {
  CAT_WIN = 'cat_win',
  DOG_WIN = 'dog_win',
  NEUTRAL_WIN = 'neutral_win',
  NONE = 'none'
}

/**
 * Activity — what a player is doing right now in their room.
 *
 * Drives the per-room visual layer in GameMap (打字 / 喝咖啡 / 偷看 / 等等).
 * Only meaningful during `GamePhase.FREE_ROAM`; other phases set everyone to
 * `idle` or `meeting` as appropriate.
 *
 * `commute` is the in-transit state — the player is between rooms moving
 * along a corridor. `position.pathProgress` advances 0→1 over a few ticks,
 * after which the player arrives at `position.destination` and picks a new
 * activity based on the room they landed in.
 */
export type Activity =
  | { kind: 'idle' }
  | { kind: 'work'; subject: string }     // "改 PPT 第 18 页" / "debug" / "对齐 OKR"
  | { kind: 'chat'; withId?: string }     // 茶水间闲聊
  | { kind: 'sneak'; targetId?: string }  // 资本家蹲守目标
  | { kind: 'meeting' }                   // 全员会议
  | { kind: 'commute' };                  // 在走廊路上

export interface PlayerPosition {
  x: number;
  y: number;
  room: string;
  /** 0..1 — interpolation progress along the corridor when `commute`-ing.
   *  Undefined when the player is settled in a room. */
  pathProgress?: number;
  /** Where the player is heading (set when commute begins, cleared on arrive). */
  destination?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  role: string;
  team: Team;
  isAlive: boolean;
  position: PlayerPosition;
  /** Current activity — drives the per-room icon + tooltip text. The engine
   *  sets it every tick during free_roam; falls back to `{ kind: 'idle' }`
   *  in all other phases. */
  activity?: Activity;
  /** Human-readable activity caption (e.g. "Frank 在改 PPT 第 18 页"). Sent
   *  to the client for tooltips + the action log; synthesised from `activity`
   *  on the server side so the client doesn't have to localise. */
  activityText?: string;
  tasks: TaskState[];
  killCooldown: number;
  emergencyMeetings: number;
  /** 离职员工是否已使用劳动仲裁投票（每人仅限一次） */
  ghostVoteUsed: boolean;
  /** AI 人格类型 */
  personality: string;
}

export interface TaskState {
  id: string;
  type: 'short' | 'long' | 'common';
  location: string;
  completed: boolean;
  steps: number;
  currentStep: number;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: PlayerState[];
  round: number;
  taskProgress: number;
  winner: WinCondition;
  meetingCaller?: string;
  deadBodyLocation?: string;
  votes: Record<string, string>;
  /** 离职员工的劳动仲裁投票（与正常投票分开计票） */
  ghostVotes: Record<string, string>;
  config: GameConfig;
}

export interface GameConfig {
  playerCount: number;
  mapId: string;
  discussionTime: number;
  votingTime: number;
  killCooldown: number;
  emergencyMeetings: number;
  taskCount: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  playerCount: 8,
  mapId: 'cat_manor',
  discussionTime: 60,
  votingTime: 30,
  killCooldown: 30,
  emergencyMeetings: 2,
  taskCount: 4
};

export interface GameResult {
  winner: WinCondition;
  rounds: number;
  players: {
    id: string;
    name: string;
    role: string;
    team: Team;
    isAlive: boolean;
    tasksCompleted: number;
    kills: number;
  }[];
  timeline: GameEvent[];
}

export interface GameEvent {
  round: number;
  phase: GamePhase;
  type: string;
  description: string;
  timestamp: number;
}
