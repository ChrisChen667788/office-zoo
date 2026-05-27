import { EventEmitter } from 'events';
import {
  type GameState,
  type GameConfig,
  type PlayerState,
  type GameEvent,
  type SerializedGameState,
  type SerializedPlayer,
  GamePhase,
  Team,
  WinCondition,
  Role,
  ROLE_PRESETS,
  ROLE_REGISTRY,
  DEFAULT_GAME_CONFIG,
  type Personality,
  assignPersonalities,
  PERSONALITY_REGISTRY,
  roomCenter,
  MAP_W,
  MAP_H,
} from '@furball/shared';
import { TaskManager } from './TaskManager';
import { BaseAgent } from '../agents/BaseAgent';
import { logger } from '../utils/logger';
import { recordGameResults, recordVoteAgainst } from '../services/characterStatsStore';
import { recordSpectatorViews } from '../services/userCharacterViewsStore';
import { getWeeklyLeaders } from '../services/characterVoteStore';
import { assignRoomActivity, commuteCaption, pickAnchor, pickCarriedItem } from './activity';
// Activity + PlayerTickInfo are new — added separately to keep the diff
// against the original import block obvious. PlayerState is already imported
// above as a type, so we don't repeat it here.
import type { PlayerTickInfo } from '@furball/shared';

const AI_NAMES = [
  'Tony', 'Lisa', 'Kevin', 'Amy', 'David', 'Frank',
  'Grace', 'Helen', 'Jack', 'Mike', 'Ruby', 'Oscar',
  '张总', '李总', '小王', '小陈', '阿强', '老赵',
  '陈姐', '实习生小明',
];

const ROOMS = [
  '开放工区', '茶水间', '会议室', 'HR办公室', '服务器机房',
  '监控室', '产品部', '老板办公室', '文印室', '电梯间',
];

function randomRoom(): string {
  return ROOMS[Math.floor(Math.random() * ROOMS.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** v6.35 P5 — weighted sample-without-replacement. Each item picks
 *  with probability proportional to its weight (clamped ≥ 0.01 so
 *  zero-weight items still have a tiny chance, preventing a single
 *  trending name from dominating every game). Used by createPlayers
 *  to bias the AI roster toward hot-quote-nominated names.
 *
 *  Exported (v6.36 P1) for direct vitest invocation — math sanity
 *  checks live in GameEngine.test.ts. */
export function weightedSample<T>(items: T[], weights: number[], count: number): T[] {
  const pool = items.map((it, i) => ({ it, w: Math.max(0.01, weights[i] ?? 1) }));
  const out: T[] = [];
  for (let k = 0; k < count && pool.length > 0; k++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** v6.30 P5 — cross-topic stopwords. These bigrams + English tokens
 *  appear in too many UNRELATED speeches to be useful overlap signal
 *  (e.g. "工位" / "OKR" / "CEO" — most office speech mentions them).
 *  v6.28 P2 FP audit identified 6/8 tripped pairs that hinged on
 *  exactly these tokens. Dropping them from BOTH hint and speech
 *  token sets pushes baseline FP rate down without hurting true
 *  positives (real leaks rely on names + distinctive verbs, not
 *  generic 班味 vocabulary). */
const LEAK_STOPWORDS = new Set<string>([
  // Cross-topic CJK bigrams (the words EVERY speech mentions)
  '工位', '加班', '老板', 'HR', '会议', '周报', '同事', '公司',
  '今天', '昨天', '上次', '下次', '一下', '一个', '一次',
  // Generic English business jargon
  'okr', 'kpi', 'ceo', 'cto', 'hr', 'pua', 'ai', 'q1', 'q2', 'q3', 'q4',
  'pm', 'pr', 'prd',
  // Numeric "N 分钟" / "N 小时" generic
  '分钟', '小时',
]);

/** v6.27 P2 — split text into content tokens for Jaccard-style fuzzy
 *  leak-quote detection. Strategy:
 *    - Whitespace + Chinese-punct first-pass split.
 *    - English runs (`[A-Za-z0-9_]+` length ≥ 2) kept as one token.
 *    - Chinese runs (CJK Unified Ideographs) yielded as overlapping
 *      2-char bigrams ("我工位的" → {"我工","工位","位的"}). Bigrams
 *      capture local context cheaply and handle paraphrase ordering.
 *    - All else (single English chars, single CJK chars, pure punct)
 *      dropped as stop tokens.
 *    - v6.30 P5: drop LEAK_STOPWORDS so cross-topic words don't carry
 *      Jaccard weight.
 *  Returns a Set so callers can do O(1) overlap. */
function leakTokenize(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  // Split on punctuation + whitespace runs
  const segments = text.split(/[\s,，。!?！？@\-_'"()（）【】《》:：;；、~`*]+/);
  for (const seg of segments) {
    if (!seg) continue;
    // Walk char-by-char; segregate ASCII alnum runs vs CJK runs.
    let i = 0;
    while (i < seg.length) {
      const c = seg.charCodeAt(i);
      // ASCII alnum (and underscore) run
      if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f) {
        let j = i + 1;
        while (j < seg.length) {
          const cj = seg.charCodeAt(j);
          if (!((cj >= 0x30 && cj <= 0x39) || (cj >= 0x41 && cj <= 0x5a) || (cj >= 0x61 && cj <= 0x7a) || cj === 0x5f)) break;
          j++;
        }
        const tok = seg.slice(i, j).toLowerCase();
        if (tok.length >= 2 && !LEAK_STOPWORDS.has(tok)) out.add(tok);
        i = j;
        continue;
      }
      // CJK Unified Ideographs (basic + extended A — covers ~99% of
      // Chinese content). Emit 2-char bigrams.
      if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) {
        let j = i + 1;
        while (j < seg.length) {
          const cj = seg.charCodeAt(j);
          if (!((cj >= 0x4e00 && cj <= 0x9fff) || (cj >= 0x3400 && cj <= 0x4dbf))) break;
          j++;
        }
        const run = seg.slice(i, j);
        for (let k = 0; k + 2 <= run.length; k++) {
          const bg = run.slice(k, k + 2);
          if (!LEAK_STOPWORDS.has(bg)) out.add(bg);
        }
        i = j;
        continue;
      }
      i++;
    }
  }
  return out;
}

export class GameEngine extends EventEmitter {
  readonly state: GameState;
  /** Wall-clock when this engine was created — used by TTL sweeper. */
  readonly createdAt: number = Date.now();
  /** v5.8.2 — spectator's X-User-Id (from game:create payload). Optional:
   *  anonymous-friendly games keep null here, in which case memory entries
   *  for this game store target_user_id=NULL (degrades to v5.8.1 behaviour:
   *  agent-archetype-only memory chain, not per-spectator). */
  readonly spectatorUserId: string | null;
  private agents: Map<string, BaseAgent> = new Map();
  private taskManager: TaskManager;
  private timeline: GameEvent[] = [];
  private running = false;
  private destroyed = false;
  private discussionResolver?: () => void;
  /** Compressed record of last round's discussion — fed into next round's context for memory. */
  private lastRoundSpeeches: Array<{ name: string; text: string }> = [];
  /** v6.25 P1 — psy-war leaks submitted by the spectator via GhostChatPanel's
   *  战术 @ button. FIFO, cap 5. Fed into BaseAgent.generateSpeech as
   *  "anonymous ex-coworker tips" the AI can quote/discredit/ignore.
   *  Cleared each round (`pushLeakedHint` keeps a sliding window). */
  private leakedHints: string[] = [];
  /** Child logger bound to this engine's gameId — created lazily. */
  private _log?: ReturnType<typeof logger.child>;
  private get log() {
    if (!this._log) this._log = logger.child({ gameId: this.state.id, component: 'engine' });
    return this._log;
  }

  constructor(configOrPlayerCount: Partial<GameConfig> | number = {}, spectatorUserId?: string) {
    super();
    this.spectatorUserId = spectatorUserId ?? null;
    const config: Partial<GameConfig> =
      typeof configOrPlayerCount === 'number'
        ? { playerCount: configOrPlayerCount }
        : configOrPlayerCount;
    const mergedConfig: GameConfig = { ...DEFAULT_GAME_CONFIG, ...config };
    this.state = {
      id: `game_${Date.now()}`,
      phase: GamePhase.LOBBY,
      players: [],
      round: 0,
      taskProgress: 0,
      winner: WinCondition.NONE,
      votes: {},
      ghostVotes: {},
      config: mergedConfig,
    };
    this.taskManager = new TaskManager(ROOMS);
  }

  // ---------- Setup ----------

  createPlayers(
    weeklyLeaders: Record<string, string> = {},
    nominationCounts: Map<string, number> = new Map(),
  ): void {
    const count = this.state.config.playerCount;
    const preset = ROLE_PRESETS[count] ?? ROLE_PRESETS[8];
    const roles: Role[] = shuffle([...preset.cat, ...preset.dog, ...preset.neutral]);
    // v6.35 P5 — weight each name by its hot-quote nomination count
    // over the last 7 days. weight = 1 + 0.5 × min(mentions, 5) — caps
    // at 3.5x so even a heavily-quoted rat doesn't show up every game.
    const weights = AI_NAMES.map((n) => 1 + 0.5 * Math.min(nominationCounts.get(n) ?? 0, 5));
    const names = weightedSample(AI_NAMES, weights, count);
    const personalities = assignPersonalities(count);

    // v6.16 P1 — apply per-character weekly-vote bias. For each named
    // player whose character has a "this week's winner" personality,
    // 50% chance to swap (or overwrite) their dealt personality toward
    // that winner. Reflects user votes back into actual gameplay.
    for (let i = 0; i < count; i++) {
      const leader = weeklyLeaders[names[i]];
      if (!leader || personalities[i] === (leader as Personality) || Math.random() >= 0.5) continue;
      // Prefer swap (preserves overall personality distribution if count ≤ 8)
      const swapAt = personalities.findIndex((p, j) => j !== i && p === (leader as Personality));
      if (swapAt >= 0) {
        [personalities[i], personalities[swapAt]] = [personalities[swapAt], personalities[i]];
      } else {
        // No one has it — accept a duplicate. assignPersonalities already
        // cycles when count > 8 so duplicates are allowed.
        personalities[i] = leader as Personality;
      }
    }

    for (let i = 0; i < count; i++) {
      const role = roles[i];
      const info = ROLE_REGISTRY[role];
      const personality = personalities[i];
      const player: PlayerState = {
        id: `player_${i}`,
        name: names[i],
        role,
        team: info.team,
        isAlive: true,
        position: { x: 0, y: 0, room: '开放工区' },
        tasks: [],
        killCooldown: 0,
        emergencyMeetings: this.state.config.emergencyMeetings,
        ghostVoteUsed: false,
        personality,
      };
      this.state.players.push(player);

      // Create AI agent for this player (with personality)
      // v5.8.2 — engine pipes its spectatorUserId into every agent so
      // memory recall + write scope to this watcher's chunky-style chain.
      const agent = new BaseAgent(
        player.id, player.name, role, info.team,
        personality as Personality, this.spectatorUserId,
      );
      this.agents.set(player.id, agent);
    }

    // Assign tasks to cat-team players
    for (const p of this.state.players) {
      if (p.team === Team.CAT) {
        p.tasks = this.taskManager.assignTasks(p.id, this.state.config.taskCount);
      }
    }
  }

  // ---------- Main game loop ----------

  async startGame(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // v6.16 P1 — pull this week's character vote leaders (Record<name, personality>)
    // and pipe them to createPlayers as a 50% bias. Fail-open: if the store throws
    // / file missing, we fall back to pure-random assignment (game still starts).
    let weeklyLeaders: Record<string, string> = {};
    try {
      const wl = await getWeeklyLeaders();
      weeklyLeaders = wl.leaders;
    } catch {
      /* fail-open — vote bias is polish, not gating */
    }
    // v6.35 P5 — fetch hot-quotes nominations BEFORE createPlayers so
    // the weighted sample uses the latest 7-day counts. Fail-open: if
    // hot quotes module errors, fall back to uniform shuffle (empty map).
    let nominationCounts = new Map<string, number>();
    try {
      const { getRecentNominationCounts } = await import('../routes/hotQuotes');
      nominationCounts = await getRecentNominationCounts(AI_NAMES);
    } catch { /* uniform fallback */ }

    this.createPlayers(weeklyLeaders, nominationCounts);
    // v6.31 P5 — bump server stats counters once roster is populated.
    // v6.36 P3 — include hot-nominated names (count ≥ 1) so the client
    // can show a 🔥 "热门" badge on sprites the audience asked for.
    const hotNames = this.state.players
      .map((p) => p.name)
      .filter((n) => (nominationCounts.get(n) ?? 0) >= 1);
    this.emit('roster_created', {
      names: this.state.players.map((p) => p.name),
      hotNames,
    });
    // v6.33 P4 — seed leakedHints with recent spectator-submitted 班味
    // 金句 (hotQuotes pool, top 5 recent). Per-user PSYWAR submissions
    // still arrive live via socket and append on top — pool just gives
    // every game some baseline "voice from the audience" texture even
    // if no current spectator submits during this round.
    try {
      const { getRecentHotQuoteTexts } = await import('../routes/hotQuotes');
      const seeds = (await getRecentHotQuoteTexts()).slice(0, 5);
      for (const t of seeds) this.pushLeakedHint(t);
    } catch { /* hot quotes optional — never block game start */ }
    this.emitState();

    // ROLE_REVEAL
    await this.setPhase(GamePhase.ROLE_REVEAL);
    await delay(3000);

    // Main loop
    while (this.running && this.state.winner === WinCondition.NONE) {
      this.state.round++;

      // FREE_ROAM
      await this.setPhase(GamePhase.FREE_ROAM);
      await this.runFreeRoam();

      if (this.checkWin()) break;

      // MEETING
      await this.setPhase(GamePhase.MEETING);
      await delay(2000);

      // DISCUSSION
      await this.setPhase(GamePhase.DISCUSSION);
      await this.runDiscussion();

      // VOTING
      await this.setPhase(GamePhase.VOTING);
      await this.runVoting();

      // VOTE_RESULT
      await this.setPhase(GamePhase.VOTE_RESULT);
      await this.resolveVotes();
      await delay(3000);

      if (this.checkWin()) break;
    }

    // GAME_OVER
    await this.setPhase(GamePhase.GAME_OVER);
    // v6.8 — fold final state into per-character stats. Fire-and-forget;
    // recordGameResults swallows its own errors so a stats write can never
    // block GAME_OVER signaling. Stats power PersonaCard's 战绩 line.
    void recordGameResults(this.state);
    // v6.10 — fold spectator's per-character views into their personal
    // ledger. Only when spectatorUserId is set (anonymous spectators
    // don't accumulate personalized history). Powers personalized
    // "你看过的 Top 3" on /profile.
    if (this.spectatorUserId) {
      void recordSpectatorViews(this.spectatorUserId, this.state);
    }
    this.running = false;
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Fully tear down this engine: stop the main loop, release any pending
   * discussion awaits, detach all listeners, and drop agent references.
   * Idempotent — safe to call multiple times (TTL sweep + disconnect cleanup
   * may race).
   *
   * Callers MUST remove the engine from their game Map after calling this,
   * otherwise the memory it still references (state, timeline) won't be freed.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;

    // Unblock any awaiter in runDiscussion — otherwise the engine's async
    // stack frame is kept alive by the pending Promise, leaking memory.
    this.discussionResolver?.();
    this.discussionResolver = undefined;

    // Drop all EventEmitter listeners (socket handler, future subscribers).
    this.removeAllListeners();

    // Drop strong refs to agents + timeline so V8 can reclaim them even if
    // an outer closure retained this engine.
    this.agents.clear();
    this.timeline.length = 0;
    this.lastRoundSpeeches = [];
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ---------- Phase runners ----------

  /**
   * Free-roam phase — v0.5+ uses a true real-time loop instead of the old
   * 1.5 s discrete steps.
   *
   * Loop = `FREE_ROAM_TICKS` ticks of `TICK_INTERVAL_MS` each (default
   * 36 × 250 ms = 9 s, same total wall-clock as before).
   *
   * Per tick:
   *   1. For each alive player:
   *      a. Integrate position by velocity (px += vx * dt)
   *      b. If commuting AND close to destination room centre → arrive
   *      c. If settled, occasionally pick a new destination (commute) OR
   *         a new in-room micro-target (gentle wander around the room)
   *   2. Refresh the activity caption every 5th tick (~1.25s) so tooltips
   *      don't go stale and the LLM isn't being asked every 250 ms
   *   3. Emit `tick` with positions + velocities; client uses these for
   *      dead-reckoning between snapshots.
   *
   * Kill / task / body-discovery logic is preserved verbatim from the old
   * loop, just deferred to after the ticks finish.
   */
  private async runFreeRoam(): Promise<void> {
    const TICK_INTERVAL_MS = 250;          // 4 Hz, matches the v0.5 plan
    const FREE_ROAM_TICKS = 36;            // 36 × 250 ms = 9 s
    const COMMUTE_START_PROB = 0.06;       // per tick (~1.4%/sec aggregate over 9s)
    /** Commute speed in logical units / second. ROOM_RECTS coords go up to
     *  1000 × 700, so ~120 px/s gives a ~3-4 s cross-map walk — feels human. */
    const SPEED_PX_PER_SEC = 140;
    /** "Arrived" radius in logical units. Larger → less stuttery snap; small
     *  enough that we still pick a unique room reliably. */
    const ARRIVE_RADIUS = 24;
    const dt = TICK_INTERVAL_MS / 1000;

    // Initial settle: bootstrap rooms + activities + drop player on the room
    // centre. Wipes any stale commute state from a prior round.
    for (const p of this.alivePlayers()) {
      if (!p.position.room) p.position.room = randomRoom();
      const c = roomCenter(p.position.room) ?? { x: MAP_W / 2, y: MAP_H / 2 };
      p.position.x = c.x;
      p.position.y = c.y;
      p.position.vx = 0;
      p.position.vy = 0;
      p.position.pathProgress = undefined;
      p.position.destination = undefined;
      const roommates = this.playersInRoom(p.position.room);
      const a = assignRoomActivity(p, roommates);
      p.activity = a.activity;
      p.activityText = a.activityText;
    }
    this.emitState(); // baseline state with activities populated

    for (let t = 0; t < FREE_ROAM_TICKS; t++) {
      if (!this.running || this.destroyed) return;

      for (const p of this.alivePlayers()) {
        // 1. Integrate position by velocity
        if (p.position.vx || p.position.vy) {
          p.position.x += (p.position.vx ?? 0) * dt;
          p.position.y += (p.position.vy ?? 0) * dt;
        }

        const isCommuting = !!p.position.destination;
        if (isCommuting) {
          // Arrival check — close enough to dest room centre?
          const dest = roomCenter(p.position.destination!);
          if (dest) {
            const dx = dest.x - p.position.x;
            const dy = dest.y - p.position.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= ARRIVE_RADIUS * ARRIVE_RADIUS) {
              // Arrived at room centre: finalise room + pick activity, then
              // (v0.6.1) immediately walk toward a furniture anchor that
              // matches the activity. Player visibly drifts to a desk /
              // sofa / coffee machine instead of clustering at the centre.
              p.position.room = p.position.destination!;
              p.position.destination = undefined;
              p.position.pathProgress = undefined;
              const roommates = this.playersInRoom(p.position.room);
              const a = assignRoomActivity(p, roommates);
              p.activity = a.activity;
              p.activityText = a.activityText;
              const anchor = pickAnchor(p, a.activity);
              if (anchor) {
                // Aim velocity at the furniture anchor; the next few ticks
                // will integrate toward it. Once close enough we treat that
                // as the new "settled" position via the in-room arrival
                // check below (the if (isCommuting) branch only fires when
                // destination is set, so we use vx/vy with no destination
                // → the in-room movement is its own micro-state).
                const adx = anchor.x - p.position.x;
                const ady = anchor.y - p.position.y;
                const adist = Math.sqrt(adx * adx + ady * ady) || 1;
                p.position.vx = (adx / adist) * SPEED_PX_PER_SEC * 0.6;
                p.position.vy = (ady / adist) * SPEED_PX_PER_SEC * 0.6;
                // v0.6.2 — pick a carried item that fits this furniture.
                p.carrying = pickCarriedItem(a.activity, anchor.kind);
              } else {
                // No furniture matched — sit at room centre as before.
                p.position.x = dest.x;
                p.position.y = dest.y;
                p.position.vx = 0;
                p.position.vy = 0;
                p.carrying = pickCarriedItem(a.activity, null);
              }
            } else {
              // Still en-route — refresh velocity vector (in case dest moved
              // OR our speed needs a steady-state update; cheap enough to
              // recompute every tick).
              const dist = Math.sqrt(distSq);
              p.position.vx = (dx / dist) * SPEED_PX_PER_SEC;
              p.position.vy = (dy / dist) * SPEED_PX_PER_SEC;
              // Keep pathProgress as a 0..1 hint for legacy v0.4 clients.
              const fromCenter = roomCenter(p.position.room);
              if (fromCenter) {
                const totalDx = dest.x - fromCenter.x;
                const totalDy = dest.y - fromCenter.y;
                const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
                if (totalDist > 0) {
                  const traveled = Math.sqrt(
                    (p.position.x - fromCenter.x) ** 2 +
                    (p.position.y - fromCenter.y) ** 2
                  );
                  p.position.pathProgress = Math.max(0, Math.min(1, traveled / totalDist));
                }
              }
            }
          }
        } else if (p.position.vx || p.position.vy) {
          // v0.6.1 — in-room walk toward a furniture anchor (set on
          // arrival above). Reuse the same arrival check at a tighter
          // radius so the player snaps cleanly to the anchor instead of
          // overshooting on a fast tick. No room change.
          const ANCHOR_ARRIVE_RADIUS = 10;
          // Re-derive the anchor target from the activity so we're not
          // chasing stale coordinates if the activity changed mid-walk.
          const anchor = pickAnchor(p, p.activity ?? { kind: 'idle' });
          if (!anchor) {
            // Affinity gone — kill velocity, settle in place.
            p.position.vx = 0;
            p.position.vy = 0;
          } else {
            const adx = anchor.x - p.position.x;
            const ady = anchor.y - p.position.y;
            const adistSq = adx * adx + ady * ady;
            if (adistSq <= ANCHOR_ARRIVE_RADIUS * ANCHOR_ARRIVE_RADIUS) {
              // Snap + stop. Subsequent ticks fall through to the settled
              // branch and stay put until COMMUTE_START_PROB fires.
              p.position.x = anchor.x;
              p.position.y = anchor.y;
              p.position.vx = 0;
              p.position.vy = 0;
            } else {
              const adist = Math.sqrt(adistSq);
              p.position.vx = (adx / adist) * SPEED_PX_PER_SEC * 0.6;
              p.position.vy = (ady / adist) * SPEED_PX_PER_SEC * 0.6;
            }
          }
        } else if (Math.random() < COMMUTE_START_PROB) {
          // Pick a different room to walk to.
          const choices = ROOMS.filter((r) => r !== p.position.room);
          const destRoom = choices[Math.floor(Math.random() * choices.length)];
          const dest = roomCenter(destRoom);
          if (dest) {
            p.position.destination = destRoom;
            p.position.pathProgress = 0;
            const dx = dest.x - p.position.x;
            const dy = dest.y - p.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            p.position.vx = (dx / dist) * SPEED_PX_PER_SEC;
            p.position.vy = (dy / dist) * SPEED_PX_PER_SEC;
            p.activity = { kind: 'commute' };
            p.activityText = commuteCaption(p, destRoom);
            // v0.6.2 — drop whatever they were holding before walking off
            // (no carrying-while-walking; future v0.6.3 may keep persistent
            // items like 工牌 on a permanent slot).
            p.carrying = null;
          }
        } else {
          // Settled at anchor (or never picked one). Activity caption
          // refresh + occasional anchor-shuffle when the activity changes.
          if (t % 5 === 4) {
            const roommates = this.playersInRoom(p.position.room);
            const a = assignRoomActivity(p, roommates);
            const oldKind = p.activity?.kind;
            p.activity = a.activity;
            p.activityText = a.activityText;
            // If activity kind changed, pick a new anchor (may walk to a
            // different desk / sofa / coffee machine in the same room).
            if (oldKind !== a.activity.kind) {
              const newAnchor = pickAnchor(p, a.activity);
              if (newAnchor) {
                const ndx = newAnchor.x - p.position.x;
                const ndy = newAnchor.y - p.position.y;
                const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
                if (ndist > 12) {
                  p.position.vx = (ndx / ndist) * SPEED_PX_PER_SEC * 0.5;
                  p.position.vy = (ndy / ndist) * SPEED_PX_PER_SEC * 0.5;
                }
              }
            }
          }
        }
      }

      // Broadcast the lightweight tick payload for client-side dead-reckoning.
      const tickPayload: PlayerTickInfo[] = this.state.players.map((p) => ({
        id: p.id,
        position: p.position,
        activity: p.activity,
        activityText: p.activityText,
        // v0.6.2 — carried item refreshed every tick.
        carrying: p.carrying ?? null,
      }));
      this.emit('tick', { players: tickPayload, tickAt: Date.now() });

      await delay(TICK_INTERVAL_MS);
    }

    // ---- Post-roam: original kill / task / body-discovery logic ----
    // Force everyone to settle on their target room so the kill check works
    // on real room residency, not "currently mid-corridor".
    for (const p of this.alivePlayers()) {
      if (p.position.destination) {
        const dest = roomCenter(p.position.destination);
        p.position.room = p.position.destination;
        if (dest) {
          p.position.x = dest.x;
          p.position.y = dest.y;
        }
        p.position.destination = undefined;
        p.position.pathProgress = undefined;
        p.position.vx = 0;
        p.position.vy = 0;
      }
    }

    // Dogs attempt kills
    const dogs = this.alivePlayers().filter((p) => p.team === Team.DOG && p.killCooldown <= 0);
    for (const dog of dogs) {
      const nearby = this.alivePlayers().filter(
        (p) => p.id !== dog.id && p.team !== Team.DOG && p.position.room === dog.position.room
      );
      if (nearby.length > 0) {
        const victim = nearby[Math.floor(Math.random() * nearby.length)];
        victim.isAlive = false;
        dog.killCooldown = this.state.config.killCooldown;
        this.state.deadBodyLocation = victim.position.room;

        this.addEvent('kill', `${dog.name} 在 ${victim.position.room} "优化"了 ${victim.name}`);
        this.emit('kill', {
          killerId: dog.id,
          killerName: dog.name,
          victimId: victim.id,
          victimName: victim.name,
          location: victim.position.room,
          // v6.24 P1 — include victim's personality in the event itself so
          // the client's EliminationReveal doesn't have to look it up in
          // `players` (race-prone: kill fires concurrently with state
          // updates that may flag the victim dead before the lookup).
          victimPersonality: victim.personality,
        });
        this.emitState();
        break; // Only one kill per free-roam
      }
    }

    // Cat players do tasks
    for (const p of this.alivePlayers().filter((pp) => pp.team === Team.CAT)) {
      this.taskManager.progressTasks(p.id, p.position.room);
    }
    this.updateTaskProgress();

    // Reduce kill cooldowns
    for (const p of this.alivePlayers()) {
      if (p.killCooldown > 0) p.killCooldown--;
    }

    // Random body discovery triggers meeting
    if (this.state.deadBodyLocation) {
      const discoverer = this.alivePlayers().find(
        (p) => p.position.room === this.state.deadBodyLocation && p.team !== Team.DOG
      );
      if (discoverer) {
        this.state.meetingCaller = discoverer.id;
        this.addEvent('body_found', `${discoverer.name} 在 ${this.state.deadBodyLocation} 发现有人被裁了!`);
      }
    }
  }

  /** Return all alive players currently in a given room (excludes commuters). */
  private playersInRoom(room: string): PlayerState[] {
    return this.alivePlayers().filter(
      (p) => p.position.room === room && typeof p.position.pathProgress !== 'number',
    );
  }

  private async runDiscussion(): Promise<void> {
    const alive = this.alivePlayers();
    const dead = this.deadPlayers();
    const context = this.buildDiscussionContext();

    // Speakers go in a randomized order so the "first speaker sets the tone" role rotates.
    const speakingOrder = shuffle(alive);

    // ------------------------------------------------------------------
    // 2-wave parallelization. The original implementation generated each
    // speech sequentially so late speakers could react to earlier ones
    // (cascading debate). That correctness property is worth preserving,
    // but 8 × ~4s serial ≈ 32 s is unacceptable for UX.
    //
    // Compromise: split speakers into two waves (first-half, second-half).
    // Wave 1 speaks in parallel to set the tone. Wave 2 speaks in parallel
    // while seeing ALL of Wave 1's speeches as prior context. This keeps
    // the "responders react to openers" dynamic natural debates already
    // have, while cutting wall-clock to 2 × ~4s ≈ 8-10s.
    //
    // For tiny games (≤3 alive) a single wave is fine — there's not much
    // back-and-forth to lose.
    // ------------------------------------------------------------------
    const WAVE_COUNT = speakingOrder.length <= 3 ? 1 : 2;
    const waveSize = Math.ceil(speakingOrder.length / WAVE_COUNT);
    const waves: PlayerState[][] = [];
    for (let i = 0; i < speakingOrder.length; i += waveSize) {
      waves.push(speakingOrder.slice(i, i + waveSize));
    }

    const speeches: Array<{ playerId: string; playerName: string; text: string; role: string; team: Team }> = [];

    for (const wave of waves) {
      // Snapshot priorSpeeches AT WAVE START so all speakers in this wave see
      // the same context (deterministic). Speakers within a wave don't react
      // to each other — they react to the wave(s) before them.
      const priorSpeeches = speeches.map((s) => ({ name: s.playerName, text: s.text }));

      const waveResults = await Promise.allSettled(
        wave.map(async (player) => {
          const agent = this.agents.get(player.id);
          if (!agent) {
            return { player, text: this.fallbackSpeech(player) };
          }
          // BaseAgent.generateSpeech never throws (callLLMWithTimeout returns
          // fallback on failure), but wrap anyway — any future change that
          // lets it throw shouldn't short-circuit the wave.
          try {
            // v5.8.1 — pass game scope so BaseAgent can recall cross-game
            // memories for this personality archetype. Safe to pass even
            // when memory subsystem is down (recall fails open).
            const text = await agent.generateSpeech(context, priorSpeeches, {
              gameId: this.state.id,
              round: this.state.round,
              // v6.25 P1 — feed user-submitted psy-war leaks into the
              // speech prompt. AI may believe / discredit / ignore based
              // on personality. Capped to 5 in BaseAgent itself.
              leakedHints: this.leakedHints,
            });
            return { player, text };
          } catch {
            return { player, text: this.fallbackSpeech(player) };
          }
        }),
      );

      // Preserve the speakingOrder sequence inside each wave so the UI shows
      // speeches in a consistent order (not dependent on which LLM call
      // returned first).
      for (let i = 0; i < wave.length; i++) {
        const r = waveResults[i];
        const player = wave[i];
        const text =
          r.status === 'fulfilled' ? r.value.text : this.fallbackSpeech(player);
        speeches.push({
          playerId: player.id,
          playerName: player.name,
          text,
          role: player.role,
          team: player.team,
        });
      }
    }

    // Remember this round's speeches so future rounds can reference them
    this.lastRoundSpeeches = speeches.map((s) => ({ name: s.playerName, text: s.text }));

    // Ghost comments (弹幕吐槽) — no cascading reaction needed, fully parallel.
    if (dead.length > 0) {
      const ghostResults = await Promise.allSettled(
        dead.map(async (ghost) => {
          const agent = this.agents.get(ghost.id);
          if (!agent) return null;
          const text = await agent.generateGhostComment(context);
          return {
            playerId: ghost.id,
            playerName: ghost.name,
            text,
            role: ghost.role,
            team: ghost.team,
          };
        }),
      );
      const ghostComments = ghostResults
        .filter(
          (r): r is PromiseFulfilledResult<{
            playerId: string;
            playerName: string;
            text: string;
            role: string;
            team: Team;
          }> => r.status === 'fulfilled' && r.value !== null,
        )
        .map((r) => r.value);
      if (ghostComments.length > 0) {
        this.emit('ghost_comments', ghostComments);
      }
    }

    // Emit all speeches as a batch - socket handler will process sequentially
    // Wait for socket handler to signal completion via resolveDiscussion()
    //
    // Deadlock defense: if the socket handler crashes / all clients disconnect
    // / processSpeechQueue hangs, we MUST still unblock the game loop or the
    // whole game halts indefinitely (and eventually runs out of sockets).
    //
    // Budget: 8 speeches × ~20s each + buffer ≈ 4 min. Anything beyond that is
    // pathological — force resolve so the game can advance to voting.
    const DISCUSSION_HARD_TIMEOUT_MS = 4 * 60 * 1000;

    const waitForPlayback = new Promise<void>((resolve) => {
      this.discussionResolver = resolve;
    });

    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      hardTimer = setTimeout(() => {
        this.log.warn(
          { timeoutMs: DISCUSSION_HARD_TIMEOUT_MS },
          'discussion playback exceeded hard timeout — force-resolving',
        );
        resolve();
      }, DISCUSSION_HARD_TIMEOUT_MS);
    });

    try {
      this.emit('discussion_speeches', speeches);
      await Promise.race([waitForPlayback, timeoutPromise]);
    } finally {
      if (hardTimer) clearTimeout(hardTimer);
      // Always clear the resolver — if the timeout won the race, the socket
      // handler may still invoke resolveDiscussion() later; make it a no-op.
      this.discussionResolver = undefined;
    }
  }

  /** Called by socket handler when all speeches have been played */
  resolveDiscussion(): void {
    this.discussionResolver?.();
    this.discussionResolver = undefined;
  }

  private async runVoting(): Promise<void> {
    this.state.votes = {};
    this.state.ghostVotes = {};
    const alive = this.alivePlayers();
    const dead = this.deadPlayers().filter((p) => !p.ghostVoteUsed);
    const context = this.buildDiscussionContext();
    const aliveCandidates = alive.map((p) => ({ id: p.id, name: p.name }));

    // All alive players vote simultaneously
    const votePromises = alive.map(async (player) => {
      const agent = this.agents.get(player.id);
      if (!agent) return;

      try {
        const target = await agent.generateVote(context, aliveCandidates);
        this.state.votes[player.id] = target;
      } catch {
        // Random vote on failure
        const others = alive.filter((p) => p.id !== player.id);
        const pick = others[Math.floor(Math.random() * others.length)];
        this.state.votes[player.id] = pick?.id ?? 'skip';
      }
    });

    // Dead players use ghost vote (劳动仲裁投票) - each can only vote once ever.
    //
    // v6.24 P2 — emit a real-time `ghost_vote_cast` event the instant each
    // ghost picks their target, so the GhostChatPanel ally indicator and
    // the GameMap 👻N dot can update incrementally during voting phase
    // (previously the tally arrived in one batch at vote_result).
    const ghostVotePromises = dead.map(async (ghost) => {
      const agent = this.agents.get(ghost.id);
      if (!agent) return;

      try {
        const target = await agent.generateGhostVote(context, aliveCandidates);
        if (target !== 'pass') {
          this.state.ghostVotes[ghost.id] = target;
          ghost.ghostVoteUsed = true;
          this.addEvent('ghost_vote', `离职员工 ${ghost.name} 发起了劳动仲裁投票!`);
          // Real-time signal — single ghost just voted.
          this.emit('ghost_vote_cast', {
            ghostId: ghost.id,
            ghostName: ghost.name,
            target,
          });
        }
      } catch {
        // Ghost votes default to pass on failure (save for later)
      }
    });

    // Use allSettled: a single rejection from Promise.all short-circuits the
    // remaining voters, but their async writes to state.votes / state.ghostVotes
    // still land — potentially AFTER resolveVotes() has run, producing phantom
    // votes. allSettled guarantees every voter has finished writing before we
    // tally. Inner try/catch should already prevent rejection, but this is the
    // last line of defense for unexpected sync failures (e.g. corrupted agent).
    const settled = await Promise.allSettled([...votePromises, ...ghostVotePromises]);
    const rejections = settled.filter((r) => r.status === 'rejected');
    if (rejections.length > 0) {
      this.log.warn(
        {
          rejected: rejections.length,
          total: settled.length,
          reasons: rejections.map((r) => (r as PromiseRejectedResult).reason),
        },
        'vote promises rejected unexpectedly',
      );
    }

    // v6.8 — record per-character suspicion tally for PersonaCard stats.
    // Looks up each vote target's character name (lookup-by-id from the
    // alive roster) and bumps their suspicionsReceived counter. Ghost
    // votes count the same — they're still suspicion votes against the
    // target. Fire-and-forget; recordVoteAgainst swallows its own errors.
    const idToName = new Map<string, string>();
    for (const p of this.state.players) idToName.set(p.id, p.name);
    for (const targetId of [
      ...Object.values(this.state.votes),
      ...Object.values(this.state.ghostVotes),
    ]) {
      if (targetId === 'skip') continue;
      const targetName = idToName.get(targetId);
      if (targetName) void recordVoteAgainst(targetName, this.state.id);
    }
  }

  private async resolveVotes(): Promise<void> {
    const tally: Record<string, number> = {};

    // Count alive player votes (weight: 1)
    for (const target of Object.values(this.state.votes)) {
      tally[target] = (tally[target] || 0) + 1;
    }

    // Count ghost votes (weight: 1 - 劳动仲裁投票与普通投票等权)
    for (const target of Object.values(this.state.ghostVotes)) {
      tally[target] = (tally[target] || 0) + 1;
    }

    // Find highest votes (two-pass to correctly handle 3-way ties)
    const maxVotes = Object.values(tally).reduce((m, c) => Math.max(m, c), 0);
    const topCandidates = maxVotes > 0
      ? Object.entries(tally).filter(([, c]) => c === maxVotes)
      : [];
    const eliminated: string | undefined = topCandidates.length === 1
      ? topCandidates[0][0]
      : undefined; // Tie (2+ players share max) = no elimination

    let eliminatedRole: string | undefined;
    let eliminatedPersonality: string | undefined;

    if (eliminated && eliminated !== 'skip') {
      const player = this.state.players.find((p) => p.id === eliminated);
      if (player) {
        player.isAlive = false;
        eliminatedRole = player.role;
        eliminatedPersonality = player.personality;
        const ghostVoters = Object.keys(this.state.ghostVotes).filter(
          (gid) => this.state.ghostVotes[gid] === eliminated
        );
        const ghostSuffix = ghostVoters.length > 0
          ? ` (含${ghostVoters.length}票劳动仲裁)`
          : '';
        this.addEvent('vote_out', `${player.name} 被投票开除了${ghostSuffix}! 职位: ${ROLE_REGISTRY[player.role as Role]?.displayNameCN ?? player.role}`);
      }
    } else {
      this.addEvent('vote_skip', '投票平局，无人被开除');
    }

    this.emit('vote_result', {
      votes: this.state.votes,
      ghostVotes: this.state.ghostVotes,
      eliminated,
      eliminatedRole,
      // v6.24 P1 — include eliminated personality so client's
      // EliminationReveal can read it directly instead of doing a
      // potentially-stale players.find lookup.
      eliminatedPersonality,
    });

    // v5.8.1 — round-end memory writes. Fire-and-forget; failure must
    // not block the engine tick. We snapshot the data the hook needs
    // BEFORE the void IIFE because the engine state mutates as the
    // game advances and we don't want races.
    const eliminatedSnapshot = eliminated && eliminated !== 'skip'
      ? this.state.players.find((p) => p.id === eliminated)
      : null;
    const survivorsSnapshot = this.state.players
      .filter((p) => p.isAlive)
      .map((p) => ({ id: p.id, name: p.name, personality: p.personality }));
    const gameId = this.state.id;
    const round = this.state.round;
    void this.recordRoundMemory({
      gameId, round,
      eliminated: eliminatedSnapshot
        ? { id: eliminatedSnapshot.id, name: eliminatedSnapshot.name, personality: eliminatedSnapshot.personality }
        : null,
      survivors: survivorsSnapshot,
    });

    this.state.deadBodyLocation = undefined;
    this.state.meetingCaller = undefined;
    this.emitState();
  }

  /** v5.8.1 — per-round memory batch. One entry per surviving agent
   *  (witness summary) + a high-importance self-entry for whoever got
   *  eliminated. Skips agents without a personality (memory is keyed by
   *  personality archetype — no personality = no chunky-style identity).
   *
   *  Importance ranks:
   *  - 0.5 default for witness ("我看到了 X 被投出")
   *  - 0.9 for self-elimination ("我被开除了") — strongest signal
   *  - 0.8 for skip-round ("没人被投, 我活下来一轮")
   *
   *  Fully best-effort: a single failed embedding or DB hiccup loses
   *  the round's memories but doesn't impact the live game. */
  private async recordRoundMemory(args: {
    gameId: string;
    round: number;
    eliminated: { id: string; name: string; personality?: string } | null;
    survivors: Array<{ id: string; name: string; personality?: string }>;
  }): Promise<void> {
    try {
      // Lazy-require so engine doesn't carry a hard dependency on pgvector
      // for tests that stand it up in isolation. Dynamic ESM import keeps
      // the module unloaded until the first round-end actually fires.
      const { writeMemoryBatch } = await import('../services/memoryWrite');
      const entries = [];
      const elimDescriptor = args.eliminated
        ? `${args.eliminated.name} 被投票开除`
        : '本轮平票, 没人被开除';
      // v5.8.2 — tag every entry with the spectator's userId (null for
      // anonymous games). Future recalls filtered by target_user_id only
      // see memories from games THIS spectator watched.
      const spectator = this.spectatorUserId;
      // Witness entries for survivors
      for (const s of args.survivors) {
        if (!s.personality) continue;
        // Don't write a witness entry to the eliminated agent here —
        // they get a higher-importance self-entry below.
        if (args.eliminated && s.id === args.eliminated.id) continue;
        entries.push({
          agentArchetype: s.personality,
          targetUserId: spectator,
          sourceGameId: args.gameId,
          sourceRound: args.round,
          kind: 'event' as const,
          content: `在 game ${args.gameId} 第${args.round}轮全员会议, ${elimDescriptor}, 我活了下来`,
          importance: args.eliminated ? 0.5 : 0.6,
          targetPlayerId: args.eliminated?.id ?? null,
        });
      }
      // Self-elimination entry — strongest memory signal.
      if (args.eliminated && args.eliminated.personality) {
        entries.push({
          agentArchetype: args.eliminated.personality,
          targetUserId: spectator,
          sourceGameId: args.gameId,
          sourceRound: args.round,
          kind: 'event' as const,
          content: `在 game ${args.gameId} 第${args.round}轮全员会议, 我被同事们投票开除了`,
          importance: 0.9,
        });
      }
      if (entries.length === 0) return;
      await writeMemoryBatch(entries);
      this._log?.debug({ count: entries.length, round: args.round }, 'wrote round memory');

      // v5.9.0 — reflection trigger. Every ROUND_TRIGGER (=5) rounds, the
      // surviving agents' accumulated event memories get condensed into
      // 3-5 high-level beliefs. We fire reflection per unique personality
      // so we don't waste LLM calls on duplicate (archetype, spectator)
      // pairs (an 8-player game has 8 personalities, but each only
      // needs one reflection pass).
      const { maybeReflect } = await import('../services/reflectionLoop');
      const uniqueArchetypes = Array.from(
        new Set(args.survivors.map((s) => s.personality).filter((p): p is string => !!p))
      );
      // Reuse the spectator binding declared above for the witness writes.
      // Fire in parallel — each reflection is independent. Each call is
      // self-gated by maybeReflect's threshold check, so calling it on
      // every round-end is safe and cheap when no trigger has fired.
      const results = await Promise.allSettled(
        uniqueArchetypes.map((arche) =>
          maybeReflect({
            agentArchetype: arche,
            targetUserId: spectator,
            sourceGameId: args.gameId,
            currentRound: args.round,
          })
        )
      );
      const triggered = results.filter(
        (r): r is PromiseFulfilledResult<{ triggered: boolean; beliefsWritten?: number }> =>
          r.status === 'fulfilled' && r.value.triggered === true
      );
      if (triggered.length > 0) {
        const totalBeliefs = triggered.reduce((s, r) => s + (r.value.beliefsWritten ?? 0), 0);
        this._log?.info({
          archetypes: triggered.length,
          beliefs: totalBeliefs,
          round: args.round,
        }, 'reflection fired');
      }
    } catch (err) {
      this._log?.debug({ err: (err as Error).message }, 'memory write skipped');
    }
  }

  // ---------- Win condition check ----------

  private checkWin(): boolean {
    const aliveCats = this.alivePlayers().filter((p) => p.team === Team.CAT).length;
    const aliveDogs = this.alivePlayers().filter((p) => p.team === Team.DOG).length;

    if (aliveDogs === 0) {
      this.state.winner = WinCondition.CAT_WIN;
      this.addEvent('game_over', '资本家全部被赶走，打工人阵营获胜!');
      this.emit('game_over', { winner: WinCondition.CAT_WIN, reason: '资本家全部被赶走' });
      return true;
    }

    if (aliveDogs >= aliveCats) {
      this.state.winner = WinCondition.DOG_WIN;
      this.addEvent('game_over', '资本家已控制公司，资本家阵营获胜!');
      this.emit('game_over', { winner: WinCondition.DOG_WIN, reason: '资本家已控制公司' });
      return true;
    }

    // Task victory
    if (this.state.taskProgress >= 100) {
      this.state.winner = WinCondition.CAT_WIN;
      this.addEvent('game_over', '所有OKR已完成，打工人阵营获胜!');
      this.emit('game_over', { winner: WinCondition.CAT_WIN, reason: '所有OKR已完成' });
      return true;
    }

    return false;
  }

  // ---------- Serialization ----------

  getSerializedState(): SerializedGameState {
    return {
      id: this.state.id,
      phase: this.state.phase,
      players: this.state.players.map((p): SerializedPlayer => ({
        id: p.id,
        name: p.name,
        isAlive: p.isAlive,
        position: p.position,
        // Include free-roam fields when present so the initial state hydrate
        // already shows everyone's activity — clients don't have to wait for
        // the first `game:tick` to learn who's doing what.
        activity: p.activity,
        activityText: p.activityText,
        // v0.6.2 — carried item, optional. Old clients ignore.
        carrying: p.carrying ?? null,
        role: p.role,
        team: p.team,
        tasksCompleted: p.tasks.filter((t) => t.completed).length,
        totalTasks: p.tasks.length,
        ghostVoteUsed: p.ghostVoteUsed,
        personality: p.personality,
      })),
      round: this.state.round,
      taskProgress: this.state.taskProgress,
      winner: this.state.winner,
      votes: this.state.votes,
      ghostVotes: this.state.ghostVotes,
    };
  }

  getTimeline(): GameEvent[] {
    return [...this.timeline];
  }

  getState(): GameState {
    return this.state;
  }

  /** v6.25 P1 — append a spectator-submitted psy-war leak. Sliding
   *  window cap 5, FIFO. Length cap 80 chars to keep prompt tight.
   *  Emits 'leak_acked' so socket handler can confirm to client. */
  pushLeakedHint(rawText: string): { accepted: boolean; reason?: string } {
    const text = (rawText ?? '').trim().slice(0, 80);
    if (text.length === 0) return { accepted: false, reason: 'empty' };
    this.leakedHints.push(text);
    if (this.leakedHints.length > 5) this.leakedHints.shift();
    this.emit('leak_acked', { text, total: this.leakedHints.length });
    return { accepted: true };
  }

  /** v6.26 P1 / v6.27 P2 — detect if a generated speech quotes any of
   *  the current leakedHints. Hybrid two-tier match:
   *
   *    Tier 1 — sliding 8-char substring (4 in v6.27 P2 → 5 in v6.30 P5
   *             → 8 in v6.31 P4). Each bump audit-driven: v6.30 dropped
   *             generic "那个 PRD" overlap, v6.31 dropped "Helen" /
   *             "40 分钟" / "工位贴满" tier-1 leakage. 8 chars demands
   *             a full proper-noun + verb-phrase verbatim quote.
   *    Tier 2 — token-level Jaccard overlap on content tokens. Catches
   *             paraphrases the LLM rewrites — "听说有同事偷过工位的
   *             零食" still shares the {听说, 同事, 偷过, 工位, 零食}
   *             content-token set with "@Frank 偷过我工位的零食".
   *             Threshold: ≥ 42% of the SHORTER side's content tokens
   *             must overlap (was 0.30 v6.27 P2; v6.31 P4 raised
   *             to 0.42 after audit showed 工位贴满-style overlap at
   *             40% exactly producing FP; 0.42 kills them while keeping
   *             real paraphrase like Frank case at 43% intact).
   *
   *  Tokenization splits on whitespace + Chinese punctuation, then
   *  yields:
   *    - English words as-is
   *    - Chinese strings as bigrams (overlapping 2-char windows)
   *  Tokens shorter than 2 chars are dropped (stop words).
   *
   *  Public so socketHandler can call it right after `game:speech`
   *  emit and broadcast `game:leak_quoted` events. */
  detectLeakQuote(speechText: string): string | null {
    const speech = speechText ?? '';
    if (speech.length === 0 || this.leakedHints.length === 0) return null;

    // Tier 1 — substring (cheap, high-confidence)
    for (const hint of this.leakedHints) {
      const h = hint.trim();
      if (h.length < 8) continue;
      for (let i = 0; i + 8 <= h.length; i++) {
        const w = h.slice(i, i + 8);
        if (/^[\s,，。!?@\-_'"()]+$/.test(w)) continue;
        if (speech.includes(w)) return hint;
      }
    }

    // Tier 2 — token Jaccard (catches paraphrase)
    const speechTokens = leakTokenize(speech);
    if (speechTokens.size < 2) return null;
    for (const hint of this.leakedHints) {
      const hintTokens = leakTokenize(hint);
      if (hintTokens.size < 2) continue;
      let overlap = 0;
      for (const t of hintTokens) if (speechTokens.has(t)) overlap++;
      const smaller = Math.min(hintTokens.size, speechTokens.size);
      const ratio = overlap / smaller;
      if (ratio >= 0.42) return hint;
    }
    return null;
  }

  // ---------- Helpers ----------

  private alivePlayers(): PlayerState[] {
    return this.state.players.filter((p) => p.isAlive);
  }

  private deadPlayers(): PlayerState[] {
    return this.state.players.filter((p) => !p.isAlive);
  }

  private async setPhase(phase: GamePhase): Promise<void> {
    this.state.phase = phase;
    this.addEvent('phase_change', `阶段切换: ${phase}`);
    this.emit('phase_change', { phase, round: this.state.round });
    this.emitState();
  }

  private emitState(): void {
    this.emit('state', this.getSerializedState());
  }

  private addEvent(type: string, description: string): void {
    this.timeline.push({
      round: this.state.round,
      phase: this.state.phase,
      type,
      description,
      timestamp: Date.now(),
    });
  }

  private updateTaskProgress(): void {
    const catPlayers = this.state.players.filter((p) => p.team === Team.CAT);
    if (catPlayers.length === 0) {
      this.state.taskProgress = 0;
      return;
    }
    const totalTasks = catPlayers.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = catPlayers.reduce(
      (sum, p) => sum + p.tasks.filter((t) => t.completed).length,
      0
    );
    this.state.taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  private buildDiscussionContext(): string {
    const alive = this.alivePlayers();
    const playerList = alive.map((p) => `${p.name}(在${p.position.room})`).join('、');
    const deadPlayers = this.state.players.filter((p) => !p.isAlive);
    const deadNames = deadPlayers.map((p) => p.name).join('、');

    let ctx = `第${this.state.round}轮全员大会。在职员工: ${playerList}。`;
    if (deadNames) {
      ctx += ` 已被裁员: ${deadNames}。`;
      const ghostVoters = deadPlayers.filter((p) => !p.ghostVoteUsed);
      if (ghostVoters.length > 0) {
        ctx += ` 注意: ${ghostVoters.map(p => p.name).join('、')}仍持有劳动仲裁投票权(各1票)!`;
      }
    }
    if (this.state.deadBodyLocation) {
      ctx += ` 有人在${this.state.deadBodyLocation}被"优化"了!`;
      const nearBody = alive.filter((p) => p.position.room === this.state.deadBodyLocation);
      if (nearBody.length > 0) {
        ctx += ` 事发时在${this.state.deadBodyLocation}附近的人: ${nearBody.map(p => p.name).join('、')}(非常可疑!)。`;
      }
    }
    if (this.state.meetingCaller) {
      const caller = this.state.players.find((p) => p.id === this.state.meetingCaller);
      if (caller) ctx += ` 紧急会议由 ${caller.name} 发起。`;
    }

    const recentEvents = this.timeline.filter(e => e.round === this.state.round);
    if (recentEvents.length > 0) {
      ctx += ` 本轮事件: ${recentEvents.map(e => e.description).join('; ')}。`;
    }

    // Last round's speeches — feed in 3 most memorable lines so feuds carry over
    if (this.lastRoundSpeeches.length > 0 && this.state.round > 1) {
      const recap = this.lastRoundSpeeches.slice(-3)
        .map((s) => `${s.name}上轮说过:"${s.text.slice(0, 60)}${s.text.length > 60 ? '...' : ''}"`)
        .join(' | ');
      ctx += ` 上一轮会议记忆: ${recap}。`;
    }

    ctx += ' 注意:这是一场激烈的职场辩论!要用职场黑话互相质疑、指名道姓、戳穿对方话术,揪出藏在公司里的资本家内鬼。要有针对性地回应前面同事的发言,形成真正的辩论,而不是各说各话!';
    return ctx;
  }

  private fallbackSpeech(player: PlayerState): string {
    if (player.team === Team.DOG) {
      const lines = [
        '这个事情的owner到底是谁？我建议大家先对齐一下信息再来甩锅！',
        '你们有完没完？我OKR都快做完了，凭什么说我摸鱼？拿出数据来！',
        '笑死了，真正的资本家就在你们身边，你们还在这瞎猜！先看看谁KPI最低！',
        '我看你才最可疑吧？天天开会不产出，你的工作量经得起审计吗？',
        '你说我可疑？我上个季度绩效3.75好吧！你呢？连周报都写不好的人有什么资格质疑我！',
        '行行行，格局打开一点好不好？我觉得我们应该聚焦核心链路，而不是互相甩锅！',
        '你这是典型的转移视线！越是大声嚷嚷的人越有问题，大家拉齐认知看清楚了！',
        '我的产出大家有目共睹，你倒是说说你的不在场证明？哑巴了？',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    if (player.team === Team.CAT) {
      const lines = [
        '别装了！你天天说赋能赋能，你到底干了啥活？大家赶紧投他！',
        '又画大饼？你倒是先把上次的OKR兑现了啊！说好的年终奖呢？',
        '你刚才的发言漏洞百出，全是黑话没有干货！你不是内鬼谁是内鬼！',
        '兄弟们，这种天天开会不干活的，不裁他裁谁？我敢打赌就是他！',
        '你说你一直在搬砖？那为什么每次有人被裁你都恰好不在现场？',
        '我已经盯了你好几轮了，你的活动轨迹完全不像在做任务，纯摸鱼！',
        '别被他PUA了！他每次发言都在试图让我们互相怀疑，经典资本家战术！',
        '你说的降本增效是不是就是降我的本增你的效？大家醒醒！',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    const neutralLines = [
      '都别吵了，反正都是给资本家打工，谁走不是走，我就看看戏！',
      '哟，又在团建呢？上次团建完就裁了三个人呢，大家小心啊！',
      '我倒觉得你们两个都挺可疑的，不如一起开除算了？反正公司不缺人！',
      '你们吵你们的，我继续摸鱼。不过话说回来，有人注意到某些人一直沉默不语吗？',
    ];
    return neutralLines[Math.floor(Math.random() * neutralLines.length)];
  }
}
