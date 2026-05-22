import { Server as SocketServer, Socket } from 'socket.io';
import { z } from 'zod';
import { GameEngine } from '../engine/GameEngine';
import { generateTTSAudio } from '../services/tts';
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
function destroyGame(gameId: string, reason: string) {
  const engine = games.get(gameId);
  if (engine) {
    gameLogger(gameId).info({ reason }, 'destroying game');
    engine.destroy();
    games.delete(gameId);
  }
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
      const engine = new GameEngine(config.playerCount, config.userId);
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
        io.to(gameId).emit('game:error', { message: 'Game engine error: ' + err.message });
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

    socket.on('disconnect', async () => {
      socketLog.debug({ sid: socket.id }, 'client disconnected');

      if (!currentGameId) return;
      const gameId = currentGameId;
      currentGameId = null;
      const glog = gameLogger(gameId);

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

        // 1. Notify speech start
        room.emit('game:speech_start', {
          playerId: item.playerId,
          playerName: item.playerName,
        });

        // 2. Send speech text
        room.emit('game:speech', {
          playerId: item.playerId,
          playerName: item.playerName,
          text: item.text,
          role: item.role,
          team: item.team,
        });

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

  engine.on('vote_result', (data) => {
    io.to(gameId).emit('game:vote_result', {
      votes: data.votes,
      ghostVotes: data.ghostVotes || {},
      eliminated: data.eliminated,
      eliminatedRole: data.eliminatedRole,
    });
    io.to(gameId).emit('game:state', engine.getSerializedState());
  });

  engine.on('game_over', (data) => {
    io.to(gameId).emit('game:over', data);
    io.to(gameId).emit('game:state', engine.getSerializedState());
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
