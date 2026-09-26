import { Server as SocketServer, Socket } from 'socket.io';
import { z } from 'zod';
import { GameEngine } from '../engine/GameEngine';
import {
  bumpGameCreated, bumpGameOver, bumpSpeech, bumpLeak, bumpLeakQuote,
} from '../routes/stats';
import { generateTTSAudio } from '../services/tts';
import { extractEvidenceRefs } from '../services/evidenceParser';
import { saveReplay } from '../services/replayStore';
import type { DualEndReason } from '@furball/shared';
// v6.126 — Phase C 真人场边角色:认领纯引擎 + 类型
import {
  claimRole, releaseUserRoles, roleOfUser, humanRoleById,
  type RoleClaims, type HumanRoleId,
  // v6.154 — Phase C 真人席位 socket 协议
  claimSeat, releaseSeatsOfUser, seatOfUser, holderOfSeat, seatTakenMap,
  type SeatClaims,
} from '@furball/shared';
import { generateAvatar, getAllCachedAvatars } from '../services/imageGen';
import { logger, gameLogger } from '../utils/logger';
import { validateEvent } from '../utils/validate';

const socketLog = logger.child({ component: 'socket' });

// ---------------------------------------------------------------------------
// Socket event payload schemas — Socket.io accepts arbitrary JSON over the
// wire. Without validation, any client could send { playerCount: 1e9 } and
// balloon memory during role assignment, or pass non-string gameIds to cause
// Map/string coercion errors. Reject malformed payloads early.
// ---------------------------------------------------------------------------
const GameCreateSchema = z.object({
  // Supported player counts — match ROLE_PRESETS in shared/src/data.
  playerCount: z.number().int().min(4).max(20),
  mode: z.string().max(32).optional(),
  // v5.8.2 — spectator's X-User-Id, optional for back-compat (older
  // clients that haven't been updated still create games successfully,
  // they just don't accumulate per-user memory). Length cap mirrors
  // utils/userId.ts contract on the client (8-64 chars).
  userId: z.string().min(8).max(64).optional(),
  // v6.37 P4 — optional 公司主题包 id (12 hex chars). When set, engine
  // fetches the pack and overrides the AI_NAMES roster with the user-
  // curated NPC names. Invalid / missing pack falls back silently to
  // default names so a broken share link doesn't block game start.
  companyPackId: z.string().regex(/^[0-9a-f]{12}$/).optional(),
  // v6.156 — 游戏语言(客户端由 gameLocaleFromUiLocale 自动填入,缺省 zh)
  locale: z.enum(['zh', 'en', 'ja', 'ko']).optional(),
});

// gameId shape is `game_<timestamp>` — just enforce a reasonable cap.
const GameIdSchema = z.string().min(1).max(64);

const games = new Map<string, GameEngine>();

/**
 * Read-only view of current server state — consumed by /api/health.
 * Snapshot pattern: return a plain object, not the live Map, so callers
 * can't accidentally mutate or iterate-while-modifying.
 */
export function getServerStats() {
  let oldestAgeMs = 0;
  const now = Date.now();
  for (const engine of games.values()) {
    const age = now - engine.createdAt;
    if (age > oldestAgeMs) oldestAgeMs = age;
  }
  return {
    activeGames: games.size,
    pendingCleanups: pendingCleanups.size,
    oldestGameAgeMs: oldestAgeMs,
  };
}

/**
 * Grace period for reconnection after the last client leaves a room.
 * If nobody rejoins within this window, the game engine is destroyed.
 */
const EMPTY_ROOM_GRACE_MS = 5 * 60 * 1000; // 5 min

/**
 * Hard TTL for any game regardless of activity — safety net against leaks
 * from games that somehow never see a `game_over` or disconnect.
 */
const MAX_GAME_LIFETIME_MS = 60 * 60 * 1000; // 60 min

/** TTL sweep cadence. */
const TTL_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 min

/** Pending cleanup timers keyed by gameId (set when room becomes empty). */
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Destroy + unregister a game. Idempotent. Cancels any pending grace-period
 * cleanup as well.
 */
// v6.126 — Phase C:每局的真人角色认领台账(gameId → roleId→socketId)。
// 挂 socketHandler 模块级(非 engine 状态):它是连接层概念,随房间生灭。
const humanClaims = new Map<string, RoleClaims>();

/** 广播某局当前的角色占用位图(不暴露 socketId,只报 taken)。 */
function broadcastRoleClaims(io: SocketServer, gameId: string) {
  const claims = humanClaims.get(gameId) ?? {};
  const taken: Record<string, boolean> = {};
  for (const k of Object.keys(claims)) taken[k] = true;
  io.to(gameId).emit('game:role_claims', { taken });
}

// v6.154 — Phase C 真人席位台账(gameId → playerId→socketId)。
// socket 层仅管 socketId 映射;controller 字段在 engine 内管理。
const seatClaims = new Map<string, SeatClaims>();

/** 广播某局当前的席位占用位图(绝不含 userId/角色,只含 playerId→true)。 */
function broadcastSeatClaims(io: SocketServer, gameId: string) {
  const claims = seatClaims.get(gameId) ?? {};
  io.to(gameId).emit('game:seat_claims', { taken: seatTakenMap(claims) });
}

function destroyGame(gameId: string, reason: string) {
  const engine = games.get(gameId);
  if (engine) {
    gameLogger(gameId).info({ reason }, 'destroying game');
    engine.destroy();
    games.delete(gameId);
  }
  humanClaims.delete(gameId); // v6.126 — 房间销毁连带清认领台账
  seatClaims.delete(gameId);  // v6.154 — 同上,清席位台账
  const timer = pendingCleanups.get(gameId);
  if (timer) {
    clearTimeout(timer);
    pendingCleanups.delete(gameId);
  }
}

interface SpeechQueueItem {
  playerId: string;
  playerName: string;
  text: string;
  role?: string;
  team?: string;
}

export function setupSocketHandler(io: SocketServer) {
  // Start the global TTL sweeper once. Cleans up games that somehow leak past
  // MAX_GAME_LIFETIME_MS (long games, orphaned engines, etc.).
  startTTLSweeper();

  io.on('connection', (socket: Socket) => {
    socketLog.debug({ sid: socket.id }, 'client connected');
    let currentGameId: string | null = null;
    // v6.29 P5 — PSYWAR per-socket abuse guard. Rolling 60s window cap +
    // per-session hard cap. Without this a malicious or buggy client can
    // spam game:psy_war_leak and pollute every game's leakedHints FIFO.
    const psyWarTimes: number[] = [];   // unix ms of accepted leaks
    let psyWarTotal = 0;
    // v6.83 — 观众干预道具限流(筹码在客户端,这里是服务端兜底闸)
    const interveneTimes: number[] = [];
    let interveneTotal = 0;

    socket.on('game:create', async (rawConfig: unknown) => {
      const v = validateEvent(GameCreateSchema, rawConfig);
      if (!v.ok) {
        socketLog.warn({ sid: socket.id, err: v.message }, 'game:create rejected');
        socket.emit('game:error', { message: v.message });
        return;
      }
      const config = v.data;

      // v5.8.2 — userId optional in payload; engine stores it for
      // per-spectator chunky-style memory (RFC §3.2 target_user_id key).
      // v6.37 P4 — companyPackId routes through GameConfig so the engine
      // sees it during startGame's pack-fetch step.
      const engine = new GameEngine(
        {
          playerCount: config.playerCount,
          companyPackId: config.companyPackId,
          // v6.156 — 游戏语言(客户端传 locale,缺省 'zh')
          ...(config.locale ? { locale: config.locale } : {}),
          // v6.85 P2 — 双公司对抗(payload 里早有 mode 字段,白名单只放 dual;
          // dual 强制 8 人,createPlayers 分配失败会自动退回单公司)
          ...(config.mode === 'dual' ? { mode: 'dual' as const, playerCount: 8 } : {}),
        },
        config.userId,
      );
      const gameId = engine.state.id;
      games.set(gameId, engine);
      currentGameId = gameId;

      socket.join(gameId);
      socket.emit('game:created', { gameId });
      socket.emit('game:state', engine.getSerializedState());

      // Push ALL cached avatars to the new client immediately. We deliberately
      // skip the "filter to liveRoles" optimisation because at game:create
      // time the engine has not assigned roles yet (that happens inside
      // engine.startGame()), so the filter would always come up empty and
      // every player would render as an emoji. Pushing all 23 wastes ~4 KB of
      // socket frames but guarantees instant role-art hydration once roles
      // get assigned a few hundred ms later.
      const cached = getAllCachedAvatars();
      for (const [role, url] of Object.entries(cached)) {
        socket.emit('game:avatar_ready', { role, team: '', url });
      }
      socketLog.info({
        sid: socket.id, gameId, cachedCount: Object.keys(cached).length,
      }, 'pushed cached avatars on game:create');

      // Set up engine event listeners
      setupEngineListeners(io, gameId, engine);

      gameLogger(gameId).info(
        { playerCount: config.playerCount, sid: socket.id },
        'game created',
      );
    });

    socket.on('game:start', async (rawGameId: unknown) => {
      const v = validateEvent(GameIdSchema, rawGameId);
      if (!v.ok) {
        socketLog.warn({ sid: socket.id, err: v.message }, 'game:start rejected');
        socket.emit('game:error', { message: v.message });
        return;
      }
      const gameId = v.data;

      const engine = games.get(gameId);
      if (!engine) {
        socket.emit('game:error', { message: 'Game not found' });
        return;
      }
      const glog = gameLogger(gameId);

      // Start avatar generation in background
      const roles = [...new Set(engine.state.players.map(p => p.role))];
      generateAllAvatarsInBackground(io, gameId, roles);

      // Run the game
      glog.info({ sid: socket.id }, 'starting game');
      engine.startGame().catch(err => {
        glog.error({ err }, 'game engine crashed');
        io.to(gameId).emit('game:error', { message: 'Game engine error: ' + (err?.message ?? 'unknown') });
        // v6.55 #1 — startGame now contains its own phase errors (graceful
        // game_over + running=false), so reaching here means even that failed.
        // Tear the engine down so a half-dead game can't linger in the Map and
        // wedge future joins; small delay lets the error toast reach clients.
        setTimeout(() => destroyGame(gameId, 'startGame rejected'), 5_000).unref();
      });
    });

    socket.on('game:join', (rawGameId: unknown) => {
      const v = validateEvent(GameIdSchema, rawGameId);
      if (!v.ok) {
        socketLog.warn({ sid: socket.id, err: v.message }, 'game:join rejected');
        socket.emit('game:error', { message: v.message });
        return;
      }
      const gameId = v.data;

      const engine = games.get(gameId);
      if (!engine) {
        socket.emit('game:error', { message: 'Game not found' });
        return;
      }

      // Client is reconnecting / joining — cancel any pending grace-period
      // cleanup so we don't destroy a game the user is actively coming back to.
      const pending = pendingCleanups.get(gameId);
      if (pending) {
        clearTimeout(pending);
        pendingCleanups.delete(gameId);
        gameLogger(gameId).info({ sid: socket.id }, 'cleanup cancelled — client rejoined');
      }

      currentGameId = gameId;
      socket.join(gameId);
      socket.emit('game:state', engine.getSerializedState());

      // Send any already-generated avatars
      const avatars = getAllCachedAvatars();
      for (const [role, url] of Object.entries(avatars)) {
        socket.emit('game:avatar_ready', { role, team: '', url });
      }
    });

    // v6.114(审计 UX F-16)— 客户端明确离开对局(赛后「再来一局」)。从房间摘掉
    // 这个 socket,server 不再往它推上一局的残留事件(否则 lazy 路由切换慢一帧时,
    // 旧 game:over 还会把 HighlightReel 再弹一次)。
    socket.on('game:leave', () => {
      if (!currentGameId) return;
      // v6.126 — 离场连带释放真人角色
      const claims = humanClaims.get(currentGameId);
      if (claims && roleOfUser(claims, socket.id)) {
        humanClaims.set(currentGameId, releaseUserRoles(claims, socket.id));
        broadcastRoleClaims(io, currentGameId);
      }
      // v6.154 — 离场连带释放席位
      {
        const sc = seatClaims.get(currentGameId);
        if (sc) {
          const seat = seatOfUser(sc, socket.id);
          if (seat) {
            seatClaims.set(currentGameId, releaseSeatsOfUser(sc, socket.id));
            games.get(currentGameId)?.releaseSeat(seat);
            broadcastSeatClaims(io, currentGameId);
          }
        }
      }
      socket.leave(currentGameId);
      socketLog.debug({ sid: socket.id, gameId: currentGameId }, 'client left game room');
      currentGameId = null;
    });

    // ── v6.126 · Phase C 真人场边角色 ────────────────────────────────────
    // 认领:一角一人、一人一角(shared 纯引擎校验);结果私发,占用位图全房广播。
    socket.on('game:claim_role', (raw: unknown) => {
      if (!currentGameId || !games.has(currentGameId)) return;
      const roleId = (raw as { roleId?: string })?.roleId ?? '';
      if (!humanRoleById(roleId)) {
        socket.emit('game:role_claim_result', { ok: false, roleId, reason: 'unknown_role' });
        return;
      }
      // v6.154 — 嘉宾角色与鼠人席位互斥:占着座的不能认领嘉宾角色
      const currentSeatClaims = seatClaims.get(currentGameId) ?? {};
      if (seatOfUser(currentSeatClaims, socket.id)) {
        socket.emit('game:role_claim_result', { ok: false, roleId, reason: 'has_seat' });
        return;
      }
      const claims = humanClaims.get(currentGameId) ?? {};
      const r = claimRole(claims, roleId as HumanRoleId, socket.id);
      if (r.ok) {
        humanClaims.set(currentGameId, r.claims);
        broadcastRoleClaims(io, currentGameId);
      }
      socket.emit('game:role_claim_result', { ok: r.ok, roleId, reason: r.reason });
      socketLog.debug({ sid: socket.id, gameId: currentGameId, roleId, ok: r.ok }, 'claim role');
    });

    // 退下嘉宾席(保留旁观)。
    socket.on('game:release_role', () => {
      if (!currentGameId) return;
      const claims = humanClaims.get(currentGameId);
      if (!claims) return;
      if (roleOfUser(claims, socket.id)) {
        humanClaims.set(currentGameId, releaseUserRoles(claims, socket.id));
        broadcastRoleClaims(io, currentGameId);
      }
    });

    // 场边发言:须已认领角色;限流(6 条/分钟/连接);engine 每轮每角色再兜一道 cap。
    const humanSpeechTimes: number[] = [];
    socket.on('game:human_speech', (raw: unknown) => {
      if (!currentGameId) return;
      const engine = games.get(currentGameId);
      if (!engine) return;
      const claims = humanClaims.get(currentGameId) ?? {};
      const role = roleOfUser(claims, socket.id);
      if (!role) {
        socket.emit('game:human_speech_result', { ok: false, reason: 'no_role' });
        return;
      }
      const now = Date.now();
      while (humanSpeechTimes.length > 0 && humanSpeechTimes[0] < now - 60_000) humanSpeechTimes.shift();
      if (humanSpeechTimes.length >= 6) {
        socket.emit('game:human_speech_result', { ok: false, reason: 'rate_limited' });
        return;
      }
      const text = typeof (raw as { text?: unknown })?.text === 'string' ? (raw as { text: string }).text : '';
      const r = engine.pushHumanSpeech(role, text);
      if (r.accepted) humanSpeechTimes.push(now);
      socket.emit('game:human_speech_result', { ok: r.accepted, reason: r.reason });
    });

    // ── v6.154 · Phase C 真人席位 ──────────────────────────────────────────────

    // 席位发言限流:6 条/分钟/连接(复用嘉宾发言同一套思路)
    const seatSpeechTimes: number[] = [];

    socket.on('game:claim_seat', (raw: unknown) => {
      if (!currentGameId || !games.has(currentGameId)) return;
      const engine = games.get(currentGameId)!;
      const playerId = (raw as { playerId?: string })?.playerId ?? '';
      if (!playerId) {
        socket.emit('game:claim_seat_result', { ok: false, reason: 'missing_player_id' });
        return;
      }

      // 嘉宾角色与鼠人席位互斥:持有嘉宾角色的不能占座
      const guestClaims = humanClaims.get(currentGameId) ?? {};
      if (roleOfUser(guestClaims, socket.id)) {
        socket.emit('game:claim_seat_result', { ok: false, reason: 'has_guest_role' });
        return;
      }

      const state = engine.getState();
      const player = state.players.find((p) => p.id === playerId);
      if (!player) {
        socket.emit('game:claim_seat_result', { ok: false, reason: 'unknown_player' });
        return;
      }

      const claims = seatClaims.get(currentGameId) ?? {};
      const r = claimSeat(claims, playerId, socket.id, {
        playerIds: state.players.map((p) => p.id),
        alivePlayerIds: state.players.filter((p) => p.isAlive).map((p) => p.id),
        playerCount: state.players.length,
      });

      if (r.ok) {
        seatClaims.set(currentGameId, r.claims);
        engine.setSeatHuman(playerId);
        broadcastSeatClaims(io, currentGameId);
        // 私发该连接:身份卡(身份/阵营/同伴按游戏规则)
        // MVP:teammates 留空 []。AI 狗阵营玩家同样通过 addRoleIntel 获取同伴信息,
        // buildSystemPrompt 里 DOG 阵营也不向 AI 暴露同伴名单(保持双方信息对等,
        // 避免真人因占座而获得 AI 狗不具备的额外同伴情报,影响公平性)。
        // 未来按角色知情规则扩展时同步更新此处。
        socket.emit('game:seat_you', {
          playerId: player.id,
          name: player.name,
          role: player.role,
          team: player.team,
          teammates: [],
        });
      }
      socket.emit('game:claim_seat_result', { ok: r.ok, reason: r.reason });
      socketLog.debug({ sid: socket.id, gameId: currentGameId, playerId, ok: r.ok }, 'claim seat');
    });

    socket.on('game:release_seat', () => {
      if (!currentGameId) return;
      const engine = games.get(currentGameId);
      const claims = seatClaims.get(currentGameId);
      if (!claims) return;
      const playerId = seatOfUser(claims, socket.id);
      if (!playerId) return;
      seatClaims.set(currentGameId, releaseSeatsOfUser(claims, socket.id));
      engine?.releaseSeat(playerId);
      broadcastSeatClaims(io, currentGameId);
    });

    socket.on('game:seat_speech', (raw: unknown) => {
      if (!currentGameId) return;
      const engine = games.get(currentGameId);
      if (!engine) return;
      const claims = seatClaims.get(currentGameId) ?? {};
      const playerId = seatOfUser(claims, socket.id);
      if (!playerId) {
        socket.emit('game:seat_speech_result', { ok: false, reason: 'no_seat' });
        return;
      }
      // 限流:6 条/分钟
      const now = Date.now();
      while (seatSpeechTimes.length > 0 && seatSpeechTimes[0] < now - 60_000) seatSpeechTimes.shift();
      if (seatSpeechTimes.length >= 6) {
        socket.emit('game:seat_speech_result', { ok: false, reason: 'rate_limited' });
        return;
      }
      const text = typeof (raw as { text?: unknown })?.text === 'string'
        ? (raw as { text: string }).text : '';
      const r = engine.pushSeatSpeech(playerId, text);
      if (r.accepted) seatSpeechTimes.push(now);
      socket.emit('game:seat_speech_result', { ok: r.accepted, reason: r.reason });
    });

    socket.on('game:seat_vote', (raw: unknown) => {
      if (!currentGameId) return;
      const engine = games.get(currentGameId);
      if (!engine) return;
      const claims = seatClaims.get(currentGameId) ?? {};
      const playerId = seatOfUser(claims, socket.id);
      if (!playerId) {
        socket.emit('game:seat_vote_result', { ok: false, reason: 'no_seat' });
        return;
      }
      const targetId = typeof (raw as { targetId?: unknown })?.targetId === 'string'
        ? (raw as { targetId: string }).targetId : '';
      const r = engine.pushSeatVote(playerId, targetId);
      socket.emit('game:seat_vote_result', { ok: r.accepted, reason: r.reason });
    });

    // v6.25 P1 — psy-war leak submission. Client (GhostChatPanel 战术 @)
    // emits `game:psy_war_leak` with a string; engine pushes it onto the
    // FIFO leakedHints buffer (cap 5). pushLeakedHint emits 'leak_acked'
    // which we relay as `game:psy_war_acked` so the chat panel can
    // mark the message "AI 听到了".
    socket.on('game:psy_war_leak', (raw: unknown) => {
      if (!currentGameId) return;
      const engine = games.get(currentGameId);
      if (!engine) return;
      const text = typeof raw === 'string' ? raw : (raw as { text?: string })?.text;
      if (typeof text !== 'string') return;

      // v6.29 P5 — rate limit gate. Per-socket: ≤ 5 leaks per rolling
      // 60s, ≤ 20 total per session. Clean stale window entries first.
      const now = Date.now();
      const WINDOW_MS = 60_000;
      const PER_WINDOW = 5;
      const SESSION_TOTAL = 20;
      while (psyWarTimes.length > 0 && psyWarTimes[0] < now - WINDOW_MS) {
        psyWarTimes.shift();
      }
      if (psyWarTotal >= SESSION_TOTAL) {
        socket.emit('game:psy_war_rate_limited', { reason: 'session_cap', retryAfterMs: 0 });
        socketLog.warn({ sid: socket.id }, 'psy-war session cap hit');
        return;
      }
      if (psyWarTimes.length >= PER_WINDOW) {
        const retryAfterMs = WINDOW_MS - (now - psyWarTimes[0]);
        socket.emit('game:psy_war_rate_limited', { reason: 'window_cap', retryAfterMs });
        socketLog.warn({ sid: socket.id, retryAfterMs }, 'psy-war window cap hit');
        return;
      }

      const result = engine.pushLeakedHint(text);
      if (result.accepted) {
        psyWarTimes.push(now);
        psyWarTotal++;
        // v6.31 P5 — bump server-side stats (engine.spectatorUserId
        // identifies the user, optional for anonymous sessions).
        bumpLeak(engine.spectatorUserId ?? undefined);
        socketLog.debug({ sid: socket.id, gameId: currentGameId, len: text.length, sessionTotal: psyWarTotal }, 'psy-war leak accepted');
      }
    });

    // v6.83 — 观众「筹码买干预」。客户端纯引擎扣筹码后 emit
    // `game:intervene` {itemId, targetId?};这里只做服务端兜底:限流
    // (3/分钟, 8/会话)+ itemId 白名单 + 转引擎生效点,ack 回
    // `game:intervene_acked` 让商店面板更新状态。信任模型同 v6.74:
    // 筹码可被改,但只坑自己;真正护栏是这道限流。
    socket.on('game:intervene', (raw: unknown) => {
      if (!currentGameId) return;
      const engine = games.get(currentGameId);
      if (!engine) return;
      const itemId = (raw as { itemId?: string })?.itemId;
      const targetId = (raw as { targetId?: string })?.targetId;
      // v6.87 — headhunt(猎头快递)加入白名单;非双公司局由 engine 兜底拒绝。
      if (itemId !== 'shield' && itemId !== 'clue' && itemId !== 'spotlight' && itemId !== 'headhunt') return;

      const now = Date.now();
      const WINDOW_MS = 60_000;
      const PER_WINDOW = 3;
      const SESSION_TOTAL = 8;
      while (interveneTimes.length > 0 && interveneTimes[0] < now - WINDOW_MS) {
        interveneTimes.shift();
      }
      if (interveneTotal >= SESSION_TOTAL || interveneTimes.length >= PER_WINDOW) {
        socket.emit('game:intervene_acked', { itemId, accepted: false, reason: 'rate_limited' });
        socketLog.warn({ sid: socket.id, itemId, interveneTotal }, 'intervene rate limited');
        return;
      }

      const result = engine.applyIntervention(itemId, typeof targetId === 'string' ? targetId : undefined);
      if (result.accepted) {
        interveneTimes.push(now);
        interveneTotal++;
      }
      socket.emit('game:intervene_acked', { itemId, accepted: result.accepted, reason: result.reason });
      socketLog.debug({ sid: socket.id, gameId: currentGameId, itemId, accepted: result.accepted, reason: result.reason }, 'intervene');
    });

    socket.on('disconnect', async () => {
      socketLog.debug({ sid: socket.id }, 'client disconnected');

      if (!currentGameId) return;
      const gameId = currentGameId;
      currentGameId = null;
      const glog = gameLogger(gameId);

      // v6.126 — 断线释放真人角色,角色位不被幽灵连接占死
      const claims = humanClaims.get(gameId);
      if (claims && roleOfUser(claims, socket.id)) {
        humanClaims.set(gameId, releaseUserRoles(claims, socket.id));
        broadcastRoleClaims(io, gameId);
      }

      // v6.154 — 断线释放真人席位
      const currentSeatClaims = seatClaims.get(gameId);
      if (currentSeatClaims) {
        const occupiedSeat = seatOfUser(currentSeatClaims, socket.id);
        if (occupiedSeat) {
          seatClaims.set(gameId, releaseSeatsOfUser(currentSeatClaims, socket.id));
          games.get(gameId)?.releaseSeat(occupiedSeat);
          broadcastSeatClaims(io, gameId);
        }
      }

      // If there are still other clients in the room, nothing to do.
      // socket.io removes the socket from its rooms BEFORE this handler fires,
      // so fetchSockets reflects the post-disconnect state.
      try {
        const remaining = await io.in(gameId).fetchSockets();
        if (remaining.length > 0) {
          return;
        }
      } catch (err) {
        glog.warn({ err }, 'fetchSockets failed in disconnect handler');
        return;
      }

      // Room is empty. Schedule cleanup after the grace period to allow
      // reconnects. `game:join` above cancels this timer on reconnect.
      if (!games.has(gameId) || pendingCleanups.has(gameId)) return;

      const timer = setTimeout(() => {
        pendingCleanups.delete(gameId);
        destroyGame(gameId, 'no reconnect within grace period');
      }, EMPTY_ROOM_GRACE_MS);
      pendingCleanups.set(gameId, timer);
      glog.info(
        { graceMs: EMPTY_ROOM_GRACE_MS },
        'room empty — scheduled cleanup',
      );
    });
  });
}

let ttlSweeperStarted = false;
function startTTLSweeper() {
  if (ttlSweeperStarted) return;
  ttlSweeperStarted = true;

  setInterval(() => {
    const now = Date.now();
    let swept = 0;
    for (const [gameId, engine] of games.entries()) {
      const age = now - engine.createdAt;
      if (age > MAX_GAME_LIFETIME_MS) {
        destroyGame(gameId, `exceeded max lifetime (${Math.round(age / 60000)} min)`);
        swept++;
      }
    }
    if (swept > 0) {
      socketLog.info(
        { swept, active: games.size },
        'TTL sweep completed',
      );
    }
  }, TTL_SWEEP_INTERVAL_MS).unref();
}

function setupEngineListeners(io: SocketServer, gameId: string, engine: GameEngine) {
  const glog = gameLogger(gameId);
  const speechLog = glog.child({ component: 'speechQueue' });

  // v6.31 P5 — server-side stats counter bumps.
  engine.on('roster_created', (data: { names: string[]; hotNames?: string[] }) => {
    bumpGameCreated(data.names);
    // v6.36 P3 — relay hot-nominated names so GameMap can render
    // 🔥 badges on those sprites. Empty array if nobody nominated.
    if (data.hotNames && data.hotNames.length > 0) {
      io.to(gameId).emit('game:hot_names', { names: data.hotNames });
    }
  });

  engine.on('phase_change', (data) => {
    io.to(gameId).emit('game:phase_change', data);
    io.to(gameId).emit('game:state', engine.getSerializedState());
  });

  // Ghost comments (弹幕) from dead players
  engine.on('ghost_comments', (comments: SpeechQueueItem[]) => {
    // Send ghost comments with staggered delays for danmaku effect
    comments.forEach((comment, i) => {
      setTimeout(() => {
        io.to(gameId).emit('game:ghost_comment', {
          playerId: comment.playerId,
          playerName: comment.playerName,
          text: comment.text,
          role: comment.role,
          team: comment.team,
        });
      }, i * 1500); // Stagger by 1.5s each
    });
  });

  // Speech queue for sequential playback
  let speechQueue: SpeechQueueItem[] = [];

  engine.on('discussion_speeches', (speeches: SpeechQueueItem[]) => {
    speechLog.info({ count: speeches.length }, 'speech batch received');
    speechQueue = [...speeches];
    // processSpeechQueue now has its own try/finally guaranteeing resolveDiscussion,
    // but we still attach a catch here so an unexpected sync throw during
    // microtask scheduling can't create an unhandled rejection.
    processSpeechQueue().catch((err) => {
      speechLog.error({ err }, 'unexpected error escaped processSpeechQueue');
      engine.resolveDiscussion();
    });
  });

  async function processSpeechQueue() {
    const room = io.to(gameId);
    // resolveDiscussion MUST always fire, or the engine's runDiscussion() will
    // sit waiting for our signal forever (deadlocking the entire game loop).
    // The try/finally is the single ground-truth guarantee — individual early
    // returns / exceptions / disconnects all funnel through it.
    try {
      const clients = await io.in(gameId).fetchSockets();
      speechLog.debug({ clientCount: clients.length }, 'queue start');

      if (clients.length === 0) {
        speechLog.warn('no clients in room — skipping speech playback');
        // Short-circuit: no one is listening, don't burn TTS credits / wall-clock.
        // finally block below will still resolve the discussion so the game advances.
        return;
      }

      for (let i = 0; i < speechQueue.length; i++) {
        const item = speechQueue[i];
        const speakerLog = speechLog.child({
          playerId: item.playerId,
          playerName: item.playerName,
          step: `${i + 1}/${speechQueue.length}`,
        });
        speakerLog.debug('processing speaker');

        // v6.8 P4.2 — emit discussion progress BEFORE speech_start so the
        // client's progress bar updates atomically with the wave step.
        // Client uses (current >= total - 1) as "pressure window" trigger
        // for red pulse + tick SFX.
        room.emit('game:discussion_progress', {
          current: i + 1,
          total: speechQueue.length,
          round: engine.state.round,
        });

        // 1. Notify speech start
        room.emit('game:speech_start', {
          playerId: item.playerId,
          playerName: item.playerName,
        });

        // 2. Send speech text. v6.8 P4.1 — also scan the text for
        //    mentions of prior round speakers and attach as evidence
        //    refs, so the client can render "↳ 引用 Tony" chips +
        //    jump-to-cited affordance.
        const evidence = extractEvidenceRefs(
          item.text,
          item.playerId,
          speechQueue.slice(0, i).map((p) => ({
            playerId: p.playerId, playerName: p.playerName, text: p.text,
          })),
        );
        room.emit('game:speech', {
          playerId: item.playerId,
          playerName: item.playerName,
          text: item.text,
          role: item.role,
          team: item.team,
          ...(evidence.length > 0 ? { evidence } : {}),
        });
        // v6.31 P5 — server stats: this counts every AI-generated
        // speech that reached a room (post-evidence-extraction).
        bumpSpeech();

        // v6.26 P1 — leak quote detection. If this AI speech reuses a
        // chunk of any active psy-war leak, emit a separate signal so
        // the client can flash ✨ "AI 引用了" on both the speech and
        // the source leak bubble in GhostChatPanel. Fire-and-forget.
        const quotedHint = engine.detectLeakQuote(item.text);
        if (quotedHint) {
          // v6.31 P5 — credit the spectator who fed this leak.
          bumpLeakQuote(engine.spectatorUserId ?? undefined);
          room.emit('game:leak_quoted', {
            hintText: quotedHint,
            byPlayerId: item.playerId,
            byPlayerName: item.playerName,
            speechText: item.text,
          });
          speechLog.debug({
            hint: quotedHint.slice(0, 20),
            by: item.playerName,
          }, 'leak quoted in speech');
        }

        // 3. Generate and send TTS audio + compute accurate wait time.
        //
        // Bug history: we previously used `text.length / 4` (240 字/分钟) as
        // a duration estimate, then capped at 30s. Two failures:
        //   (a) Minimax speech-2.8-hd reads at ~3.0-3.5 字/秒 (180-210 字/分),
        //       slower than the heuristic, so the next speaker started before
        //       the current one finished — the "抢话" bug.
        //   (b) Long speeches (>120 chars) hit the 30s cap and got cut off
        //       mid-sentence.
        //
        // New approach: derive duration directly from MP3 byte size. Minimax
        // returns 128 kbps mono MP3 (see audio_setting in tts.ts), which is
        // 16,000 bytes/sec exactly. So `bytes / 16000` is the real playback
        // duration in seconds, modulo a tiny ID3 header overhead. Add 800ms
        // tail buffer so audio doesn't get cut off at the last syllable.
        let waitTime = 3000;
        try {
          const audioBuffer = await generateTTSAudio(item.text, item.role);
          if (audioBuffer) {
            const base64 = audioBuffer.toString('base64');
            const audioUrl = `data:audio/mp3;base64,${base64}`;
            room.emit('game:speech_audio', {
              playerId: item.playerId,
              audioUrl,
            });

            // 128 kbps = 16,000 bytes/sec — exact for our Minimax config.
            const BYTES_PER_SEC = 16_000;
            const audioSec = audioBuffer.length / BYTES_PER_SEC;
            // Add 800ms tail buffer so the audio plays to completion before
            // the next speaker starts. Floor at 4s so super-short clips
            // still leave room for fade-in / unlock latency.
            waitTime = Math.max(4000, Math.round(audioSec * 1000 + 800));
            speakerLog.debug({
              bytes: audioBuffer.length,
              audioSec: audioSec.toFixed(2),
              waitMs: waitTime,
            }, 'TTS audio generated');
          } else {
            // No real audio — client uses browser-TTS. Browser Tingting reads
            // Chinese at ~3.5 字/秒, so allow ~286 ms/char + 1s buffer. This
            // matches the actual playback latency of speechSynthesis better
            // than the previous 60ms/char estimate (which was 5x too fast).
            speakerLog.warn('TTS returned null — using browser-TTS-paced delay');
            waitTime = Math.max(4000, item.text.length * 290 + 1000);
          }
        } catch (err) {
          speakerLog.error({ err }, 'TTS generation failed');
          // Conservative default — long enough for a short browser-TTS read.
          waitTime = Math.max(4000, item.text.length * 200);
        }

        // Sanity guard — don't hang on NaN / negative.
        if (!Number.isFinite(waitTime) || waitTime < 0) waitTime = 4000;
        // Raised cap: 90s is enough for ~22 KB of MP3 ≈ 500 char monologue.
        // The old 30s cap chopped any speech > ~75 chars.
        waitTime = Math.min(waitTime, 90_000);

        await new Promise((r) => setTimeout(r, waitTime));

        // 4. Notify speech end
        room.emit('game:speech_end', {
          playerId: item.playerId,
        });

        // Small gap between speakers — bumped 500→900ms so the previous
        // voice has fully decayed before the next one starts. Avoids the
        // perceived "abrupt cut" between back-to-back speakers.
        await new Promise((r) => setTimeout(r, 900));
      }

      speechLog.info({ count: speechQueue.length }, 'queue complete');
    } catch (err) {
      speechLog.error({ err }, 'error during queue processing');
      // Fall through to finally — engine still advances.
    } finally {
      speechQueue = [];
      engine.resolveDiscussion();
    }
  }

  engine.on('kill', (data) => {
    io.to(gameId).emit('game:kill', data);
    io.to(gameId).emit('game:state', engine.getSerializedState());
  });

  // Free-roam tick — high-frequency lightweight payload (just position +
  // activity per player). Old clients without a `game:tick` handler simply
  // ignore it, falling back to the slower full `game:state` updates.
  engine.on('tick', (data: { players: unknown; tickAt: number }) => {
    io.to(gameId).emit('game:tick', data as never);
  });

  // v6.24 P2 — relay each ghost's vote the instant it lands, so the client
  // GameMap dot + chat ally tally update incrementally instead of waiting
  // for the vote_result batch.
  engine.on('ghost_vote_cast', (data: { ghostId: string; ghostName: string; target: string }) => {
    io.to(gameId).emit('game:ghost_vote_cast', data);
  });

  // v6.25 P1 — relay leak ack so client can mark "AI 听到了" on the
  // psy-war bubble. Same payload shape as the engine's emit.
  engine.on('leak_acked', (data: { text: string; total: number }) => {
    io.to(gameId).emit('game:psy_war_acked', data);
  });

  // v6.110 — 内部邮件(clue)专属动线:观众买完全房弹「背景调查」卡,不再只躺 event log
  engine.on('intervene_clue', (data: { targetName: string; label: string }) => {
    io.to(gameId).emit('game:intervene_clue', data);
  });

  // v6.111 — 跨局恩怨触发时实时广播,客户端给「恩怨录」按钮点红引导发现
  engine.on('grudge_vote', (data: { voterName: string; foeName: string; taunt: string }) => {
    io.to(gameId).emit('game:grudge_vote', data);
  });

  // v6.126 — 真人场边发言:全房实时广播(event log / 弹幕两端渲染)
  engine.on('human_speech', (data: { role: string; label: string; emoji: string; text: string }) => {
    io.to(gameId).emit('game:human_speech', data);
  });

  // v6.154 — 真人席位事件转发 ──────────────────────────────────────────────────

  // seat_prompt:只发给该席位持有者的连接(私发)
  engine.on('seat_prompt', (data: { playerId: string; kind: string; timeoutMs: number; round: number; candidates?: unknown }) => {
    const claims = seatClaims.get(gameId) ?? {};
    const holderSocketId = holderOfSeat(claims, data.playerId);
    if (holderSocketId) {
      io.to(holderSocketId).emit('game:seat_prompt', data);
    }
  });

  // seat_intel:私发给席位持有者
  engine.on('seat_intel', (data: { playerId: string; text: string }) => {
    const claims = seatClaims.get(gameId) ?? {};
    const holderSocketId = holderOfSeat(claims, data.playerId);
    if (holderSocketId) {
      io.to(holderSocketId).emit('game:seat_intel', data);
    }
  });

  // seat_timeout:私发持有者 + 全房公告(不含身份信息)
  engine.on('seat_timeout', (data: { playerId: string; kind: string }) => {
    const claims = seatClaims.get(gameId) ?? {};
    const holderSocketId = holderOfSeat(claims, data.playerId);
    if (holderSocketId) {
      io.to(holderSocketId).emit('game:seat_timeout', data);
    }
    // 全房公告:不暴露角色/身份,只说 AI 接管了某席位
    const state = engine.getSerializedState();
    const player = state.players.find((p) => p.id === data.playerId);
    const name = player?.name ?? '某玩家';
    // v6.fix — 原 payload 缺少 playerName 字段,Classic.tsx data.playerName 读取为 undefined;
    // 补上 playerName 字段与 announcement 公告文本,两者均安全(无角色/身份信息)。
    io.to(gameId).emit('game:seat_timeout_public', {
      playerId: data.playerId,
      playerName: name,
      kind: data.kind,
      announcement: `👤 ${name} 超时,本轮由 AI 代打`,
    });
  });

  // v6.86 — 双公司挖角/跳槽 live banner。挖角是双司局招牌时刻,实时播一条
  // (map 徽标随下一帧 game:state 翻面)。单公司局永不触发。
  engine.on('cross_action', (data: {
    kind: 'defection' | 'poach_failed' | 'smear'; text: string; company: 'a' | 'b';
    targetId: string; targetName: string;
  }) => {
    io.to(gameId).emit('game:cross_action', data);
  });

  engine.on('vote_result', (data) => {
    io.to(gameId).emit('game:vote_result', {
      votes: data.votes,
      ghostVotes: data.ghostVotes || {},
      eliminated: data.eliminated,
      eliminatedRole: data.eliminatedRole,
      // v6.24 P1 — pass through victim personality so client can drive
      // the elim剧场化 last-words pool without a stale players.find lookup.
      eliminatedPersonality: (data as { eliminatedPersonality?: string }).eliminatedPersonality,
      // v6.86 — 双公司:两司开除汇总(单司 undefined,老客户端忽略)
      dualEliminations: (data as { dualEliminations?: unknown }).dualEliminations,
    });
    io.to(gameId).emit('game:state', engine.getSerializedState());
  });

  engine.on('game_over', (data) => {
    io.to(gameId).emit('game:over', data);
    const finalState = engine.getSerializedState();
    io.to(gameId).emit('game:state', finalState);
    bumpGameOver();
    // v6.54 — persist the finished game for 🎬 replay BEFORE teardown.
    // Fire-and-forget; a replay-save hiccup must never block game_over.
    void saveReplay({
      gameId,
      endedAt: Date.now(),
      winner: finalState.winner,
      rounds: finalState.round,
      players: finalState.players.map((p) => ({
        id: p.id, name: p.name, role: p.role, team: p.team,
        isAlive: p.isAlive, personality: p.personality, avatar: p.avatar ?? undefined,
        // v6.88 — 双公司归属(单公司局 undefined),让回放页能两栏复盘。
        companyId: p.companyId,
      })),
      timeline: engine.getTimeline(),
      // v6.88 — 双公司终局快照:模式 + 市占率(来自 finalState)+ 终局缘由(来自 game_over 载荷)。
      ...(finalState.mode === 'dual'
        ? {
            mode: 'dual' as const,
            market: finalState.market,
            dualReason: (data as { dualReason?: DualEndReason }).dualReason,
          }
        : {}),
    }).catch((err) => console.error('[replay] save failed:', err));
    // Clean up after 60 s (clients have time to receive final state).
    // Use destroyGame to ensure listeners + agents are released, not just
    // the Map entry — otherwise EventEmitter listeners + agent references
    // live until GC kicks in, which on Node under load may be much later.
    setTimeout(() => destroyGame(gameId, 'game_over'), 60_000).unref();
  });
}

async function generateAllAvatarsInBackground(io: SocketServer, gameId: string, roles: string[]) {
  for (let i = 0; i < roles.length; i += 2) {
    const batch = roles.slice(i, i + 2);
    await Promise.all(batch.map(async (role) => {
      const url = await generateAvatar(role);
      if (url) {
        io.to(gameId).emit('game:avatar_ready', { role, team: '', url });
      }
    }));
    if (i + 2 < roles.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}
