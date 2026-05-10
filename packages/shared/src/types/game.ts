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

// ---------------------------------------------------------------------------
// World map definition — single source of truth for both server (movement
// integration / arrival detection) and client (canvas placement). v0.5+ uses
// these to project (x, y) into screen space. Logical coords; the client
// scales to its actual canvas size.
// ---------------------------------------------------------------------------
export const MAP_W = 1000;
export const MAP_H = 700;

export interface RoomRect {
  id: string;
  /** Top-left in logical coords */
  x: number;
  y: number;
  /** Width / height in logical coords */
  w: number;
  h: number;
}

/** 10 rooms placed across the 1000×700 map. Origin top-left. The exact
 *  layout matches the client's earlier isometric grid 1:1 (0-7 grid units →
 *  scaled into logical coords) so existing renders still look right. */
export const ROOM_RECTS: RoomRect[] = [
  { id: '茶水间',     x: 40,  y: 40,  w: 200, h: 180 },
  { id: '电梯间',     x: 250, y: 40,  w: 200, h: 100 },
  { id: '会议室',     x: 460, y: 40,  w: 200, h: 180 },
  { id: 'HR办公室',   x: 700, y: 80,  w: 240, h: 180 },
  { id: '服务器机房', x: 40,  y: 250, w: 220, h: 180 },
  { id: '开放工区',   x: 280, y: 240, w: 360, h: 220 },
  { id: '监控室',     x: 700, y: 290, w: 240, h: 170 },
  { id: '产品部',     x: 40,  y: 470, w: 240, h: 200 },
  { id: '老板办公室', x: 320, y: 490, w: 320, h: 180 },
  { id: '文印室',     x: 700, y: 490, w: 240, h: 180 },
];

/** Lookup helper — keeps server + client logic identical. Returns the room
 *  centre, which is the canonical "settled" position when a player arrives
 *  somewhere with no in-room target chosen yet. */
export function roomCenter(roomId: string): { x: number; y: number } | null {
  const r = ROOM_RECTS.find((rr) => rr.id === roomId);
  if (!r) return null;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Inverse lookup — used by the client when the user clicks somewhere on
 *  the map (future v0.6+) to figure out which room is under the cursor. */
export function roomAt(x: number, y: number): string | null {
  for (const r of ROOM_RECTS) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.id;
  }
  return null;
}

export interface PlayerPosition {
  /** Logical world coordinates in a 0..MAP_W × 0..MAP_H plane. The client
   *  maps these into its isometric/screen space. v0.5+ uses these as the
   *  single source of truth for movement; earlier versions only filled
   *  them with the room centre and let the client offset by an in-room grid. */
  x: number;
  y: number;
  /** Logical room id the player currently occupies (or is leaving). Used
   *  for room-scoped logic (kills only count when same room, body discovery,
   *  task progress, ROOM_FURNITURE lookup). Updated on arrival. */
  room: string;
  /** v0.5+ — velocity in logical units / second. Server integrates each
   *  tick (`x += vx * dt`); client uses these for dead-reckoning between
   *  ticks so motion looks 60 fps even though server only emits at 4 Hz. */
  vx?: number;
  vy?: number;
  /** 0..1 — kept for backwards-compat with v0.4 clients that interpolate
   *  along a Catmull-Rom corridor curve. New clients use vx/vy directly
   *  and ignore pathProgress. */
  pathProgress?: number;
  /** Where the player is heading (set when commute begins, cleared on arrive).
   *  Used for both UI captions ("正前往 X") and the server arrival check. */
  destination?: string;
}

/**
 * v0.6.2 — pickup-able items players carry. Tied to activity:
 *   - 咖啡杯 (cup) appears when activity is `chat` near a coffee_machine
 *   - 文件夹 (folder) appears when work happens near a printer
 *   - 录音笔 (recorder) for sneaking dogs near other players
 *   - 工牌 (badge) is the persistent "still employed" marker
 *   - 打印纸 (paper) for printer work
 *   - 咖啡 (mug) generic kitchen idle prop
 *
 * Server picks an item up when the player arrives at a matching anchor;
 * drops it (item = null) when the activity changes to something
 * incompatible. Pure visual layer in v0.6.2 — no inventory mechanics yet.
 */
export type ItemKind = 'cup' | 'folder' | 'recorder' | 'badge' | 'paper' | 'mug';

export interface CarriedItem {
  kind: ItemKind;
  /** Where the item came from, for future "borrowed your printer paper"
   *  social moments. Null for badge (always-on persistent items). */
  sourceFurnitureId?: string;
}

export interface PlayerState {
  id: string;
  name: string;
  role: string;
  team: Team;
  isAlive: boolean;
  position: PlayerPosition;
  /** v0.6.2 — what the player is currently holding. Null = empty hands.
   *  Only one slot for now (no inventory); future v0.6.3 may add a stack. */
  carrying?: CarriedItem | null;
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
