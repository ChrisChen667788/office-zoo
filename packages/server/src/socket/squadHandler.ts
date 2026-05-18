/**
 * squadHandler — v1.4.1 squad-mode socket events.
 *
 * Layered onto the same io server as PvP (firedRoomHandler) and the
 * main game engine, with the `squad:` event prefix so we don't collide.
 *
 * Inbound events:
 *   squad:create  { displayName?, scenarioBrief?, maxMembers? }
 *                 → mints a roomId, joins as host
 *   squad:join    { roomId, displayName? }
 *                 → joins existing lobby; rejects if status != 'lobby' or full
 *   squad:start   { roomId }
 *                 → host only; triggers LLM director, broadcasts 'directing'
 *                   then 'playing' with full state
 *   squad:advance { roomId }
 *                 → host only; bumps currentActIndex by 1; if past last act,
 *                   sets status='ended' and surfaces recap
 *   squad:rerun   { roomId }
 *                 → host only after 'ended'; regenerates the story with the
 *                   same members (e.g. when LLM was down and the fallback
 *                   shipped)
 *
 * Outbound:
 *   squad:state   full SquadRoom snapshot, fired on every state change
 *   squad:peer    {event: 'joined'|'left'|'replaced', userId} delta hints
 *   squad:error   {message}
 *
 * Persistence: in-memory only. Squad rooms are ephemeral sessions —
 * 30-minute hard TTL after 'ended', 1-hour TTL for never-started lobbies.
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { validateEvent } from '../utils/validate';
import {
  findArchetype,
  type SquadRoom,
  type SquadMember,
} from '@furball/shared';
import { findProfile } from '../services/profileStore';
import { analyzeSquadChemistry, directSquadStory } from '../services/squadDirector';
import { recordSquadEnd } from '../services/squadHistoryStore';
import { squadEndDelta, recordEvolutionEvent } from '../services/archetypeEvolution';

const log = logger.child({ component: 'squad' });

// ── In-mem store ─────────────────────────────────────────────────────
const rooms = new Map<string, SquadRoom>();

// Sweeper: 'lobby' rooms older than 1h or 'ended' rooms older than 30min get GC'd.
const LOBBY_TTL = 60 * 60 * 1000;
const ENDED_TTL = 30 * 60 * 1000;
const SWEEP_INTERVAL = 10 * 60 * 1000;
let sweeperStarted = false;
function startSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms) {
      const age = now - room.createdAt;
      if ((room.status === 'lobby' && age > LOBBY_TTL)
       || (room.status === 'ended' && age > ENDED_TTL)) {
        rooms.delete(id);
      }
    }
  }, SWEEP_INTERVAL).unref();
}

// ── Schemas ──────────────────────────────────────────────────────────
const CreateSchema = z.object({
  displayName:    z.string().min(1).max(24).optional(),
  scenarioBrief:  z.string().max(180).optional(),
  maxMembers:     z.number().int().min(2).max(4).optional(),
});
const JoinSchema = z.object({
  roomId:       z.string().min(1).max(64),
  displayName:  z.string().min(1).max(24).optional(),
});
const RoomIdSchema = z.object({ roomId: z.string().min(1).max(64) });

// ── Helpers ──────────────────────────────────────────────────────────
function mintId(): string {
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `sq-${rnd}`;
}

async function buildMember(
  userId: string,
  displayName: string | undefined,
  isHost: boolean,
  seatIndex: number,
): Promise<SquadMember> {
  const profile = userId ? await findProfile(userId).catch(() => null) : null;
  const arc = profile?.topArchetypes?.[0]
    ? findArchetype(profile.topArchetypes[0])
    : null;
  return {
    userId,
    displayName: displayName?.trim() || `员工 ${seatIndex + 1}`,
    archetypeId:    arc?.id,
    archetypeName:  arc?.name,
    archetypeEmoji: arc?.emoji,
    isHost,
    joinedAt: Date.now(),
  };
}

// ── Setup ────────────────────────────────────────────────────────────
export function setupSquadHandler(io: SocketServer) {
  startSweeper();

  io.on('connection', (socket: Socket) => {
    /** Track which room this socket sits in so disconnect cleans up the
     *  right seat without scanning all rooms. */
    let mySeat: { roomId: string; userId: string } | null = null;

    const userIdOf = (): string => {
      // X-User-Id arrives via auth in handshake — fallback to socket.id
      // for anonymous users so each tab is at least distinguishable.
      const fromHandshake = socket.handshake.auth?.userId;
      if (typeof fromHandshake === 'string' && fromHandshake.length > 0) {
        return fromHandshake.slice(0, 64);
      }
      return `anon-${socket.id.slice(0, 12)}`;
    };

    // ── squad:create ─────────────────────────────────────────────────
    socket.on('squad:create', async (raw: unknown) => {
      const v = validateEvent(CreateSchema, raw);
      if (!v.ok) return socket.emit('squad:error', { message: v.message });

      const userId = userIdOf();
      const member = await buildMember(userId, v.data.displayName, true, 0);
      const roomId = mintId();
      const room: SquadRoom = {
        id: roomId,
        status: 'lobby',
        members: [member],
        maxMembers: v.data.maxMembers ?? 4,
        scenarioBrief: v.data.scenarioBrief,
        acts: [],
        currentActIndex: 0,
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);

      socket.join(roomId);
      mySeat = { roomId, userId };
      log.info({ roomId, host: userId.slice(0, 8) + '…' }, 'Squad room created');
      socket.emit('squad:state', room);
    });

    // ── squad:join ───────────────────────────────────────────────────
    socket.on('squad:join', async (raw: unknown) => {
      const v = validateEvent(JoinSchema, raw);
      if (!v.ok) return socket.emit('squad:error', { message: v.message });
      const room = rooms.get(v.data.roomId);
      if (!room) return socket.emit('squad:error', { message: '房间不存在或已过期' });

      const userId = userIdOf();
      const existing = room.members.find((m) => m.userId === userId);

      if (existing) {
        // Reconnect — same user. Just re-join the socket room + push state.
        socket.join(room.id);
        mySeat = { roomId: room.id, userId };
        socket.emit('squad:state', room);
        return;
      }

      if (room.status !== 'lobby') {
        return socket.emit('squad:error', { message: '故事已经开始,不能加入' });
      }
      if (room.members.length >= room.maxMembers) {
        return socket.emit('squad:error', { message: `房间已满 (${room.maxMembers}/${room.maxMembers})` });
      }

      const member = await buildMember(userId, v.data.displayName, false, room.members.length);
      room.members.push(member);

      socket.join(room.id);
      mySeat = { roomId: room.id, userId };

      io.to(room.id).emit('squad:peer', { event: 'joined', userId });
      io.to(room.id).emit('squad:state', room);
      log.info({ roomId: room.id, joiner: userId.slice(0, 8) + '…' }, 'Squad member joined');
    });

    // ── squad:start ──────────────────────────────────────────────────
    socket.on('squad:start', async (raw: unknown) => {
      const v = validateEvent(RoomIdSchema, raw);
      if (!v.ok) return socket.emit('squad:error', { message: v.message });
      const room = rooms.get(v.data.roomId);
      if (!room) return socket.emit('squad:error', { message: '房间不存在' });
      if (!mySeat || mySeat.roomId !== room.id) {
        return socket.emit('squad:error', { message: '你不在这个房间' });
      }
      const me = room.members.find((m) => m.userId === mySeat!.userId);
      if (!me?.isHost) return socket.emit('squad:error', { message: '只有 host 能开演' });
      if (room.status !== 'lobby') return socket.emit('squad:error', { message: '不在 lobby 状态' });
      if (room.members.length < 2) {
        return socket.emit('squad:error', { message: '至少需要 2 个人才能开演' });
      }

      // v3.1.0 — pre-compute chemistry BEFORE switching to directing so
      // the 'directing' state already carries the hints. Lets the client
      // tease "🎭 国企+大厂 — 文化冲突大戏正在编剧中…" while the LLM
      // works, instead of revealing only after the playing transition.
      const preChemistry = analyzeSquadChemistry(room.members)
        .split('\n')
        .map((s) => s.trim().replace(/^•\s+/, ''))
        .filter((s) => s.length > 0);
      room.chemistryHints = preChemistry;

      // Phase 1: switch to directing, tell everyone the LLM is cooking.
      room.status = 'directing';
      io.to(room.id).emit('squad:state', room);
      log.info({ roomId: room.id, members: room.members.length, chemistry: preChemistry.length }, 'Squad direction starting');

      // Phase 2: LLM call (5-10s typically). Tolerates failure via
      // squadDirector's fallback story.
      try {
        const story = await directSquadStory({
          members: room.members,
          scenarioBrief: room.scenarioBrief,
        });
        room.acts = story.acts;
        room.recap = story.recap;
        // Director may have re-derived chemistry — prefer its version
        // since it could include LLM-friendly tweaks, but fall back to
        // our pre-computed if director returned empty (template fallback).
        if (story.chemistryHints.length > 0) room.chemistryHints = story.chemistryHints;
        room.status = 'playing';
        room.currentActIndex = 0;
        log.info({ roomId: room.id, acts: story.acts.length, chemistry: story.chemistryHints.length }, 'Squad story generated');
      } catch (err) {
        log.error({ roomId: room.id, err }, 'Squad direction failed unexpectedly');
        room.status = 'lobby'; // rollback so host can retry
        io.to(room.id).emit('squad:error', { message: 'AI 编剧出错了,等会再开演' });
        io.to(room.id).emit('squad:state', room);
        return;
      }

      io.to(room.id).emit('squad:state', room);
    });

    // ── squad:advance ────────────────────────────────────────────────
    socket.on('squad:advance', (raw: unknown) => {
      const v = validateEvent(RoomIdSchema, raw);
      if (!v.ok) return socket.emit('squad:error', { message: v.message });
      const room = rooms.get(v.data.roomId);
      if (!room) return socket.emit('squad:error', { message: '房间不存在' });
      if (!mySeat || mySeat.roomId !== room.id) return;
      const me = room.members.find((m) => m.userId === mySeat!.userId);
      if (!me?.isHost) return socket.emit('squad:error', { message: '只有 host 能翻幕' });
      if (room.status !== 'playing') return;

      const next = room.currentActIndex + 1;
      if (next >= room.acts.length) {
        room.status = 'ended';
        room.currentActIndex = room.acts.length - 1;
        // v1.4.3 — snapshot to history. Fire-and-forget; never block
        // the state broadcast on disk write.
        void recordSquadEnd({
          roomId: room.id,
          endedAt: Date.now(),
          members: room.members.map((m) => ({
            userId: m.userId,
            displayName: m.displayName,
            archetypeId: m.archetypeId,
            archetypeName: m.archetypeName,
            archetypeEmoji: m.archetypeEmoji,
          })),
          recap: room.recap,
          actCount: room.acts.length,
          scenarioBrief: room.scenarioBrief,
        });
        // v2.0.1 — archetype evolution. Each member's identity drifts a
        // bit toward "social performer" (small visibility+empathy
        // bump). Host gets the additional ambition credit for shaping
        // the room. Fire-and-forget per member; failures swallowed so
        // the squad UX never blocks on a disk write.
        const summary = `${room.members.length} 人攒局 · ${room.acts.length} 幕`;
        for (const m of room.members) {
          if (!m.userId) continue;
          void recordEvolutionEvent(
            m.userId,
            'squad-end',
            squadEndDelta({ isHost: m.isHost, actCount: room.acts.length }),
            summary,
          ).catch(() => { /* anonymous / no profile — silent no-op */ });
        }
      } else {
        room.currentActIndex = next;
      }
      io.to(room.id).emit('squad:state', room);
    });

    // ── squad:rerun ──────────────────────────────────────────────────
    socket.on('squad:rerun', async (raw: unknown) => {
      const v = validateEvent(RoomIdSchema, raw);
      if (!v.ok) return socket.emit('squad:error', { message: v.message });
      const room = rooms.get(v.data.roomId);
      if (!room) return socket.emit('squad:error', { message: '房间不存在' });
      if (!mySeat || mySeat.roomId !== room.id) return;
      const me = room.members.find((m) => m.userId === mySeat!.userId);
      if (!me?.isHost) return socket.emit('squad:error', { message: '只有 host 能重开' });
      if (room.status !== 'ended') return;

      room.status = 'directing';
      room.acts = [];
      room.currentActIndex = 0;
      room.recap = undefined;
      io.to(room.id).emit('squad:state', room);

      const story = await directSquadStory({
        members: room.members,
        scenarioBrief: room.scenarioBrief,
      });
      room.acts = story.acts;
      room.recap = story.recap;
      room.chemistryHints = story.chemistryHints; // v3.1.0 — also on rerun
      room.status = 'playing';
      io.to(room.id).emit('squad:state', room);
    });

    // ── disconnect ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!mySeat) return;
      const room = rooms.get(mySeat.roomId);
      if (!room) return;
      // Don't remove the seat — let them re-join with same userId.
      // Just notify peers so the UI can render a faded chip.
      io.to(room.id).emit('squad:peer', {
        event: 'left',
        userId: mySeat.userId,
      });
    });
  });
}

/** Read-only health stats. */
export function getSquadStats() {
  let lobby = 0, playing = 0, ended = 0;
  for (const r of rooms.values()) {
    if (r.status === 'lobby') lobby++;
    else if (r.status === 'playing') playing++;
    else if (r.status === 'ended') ended++;
  }
  return { lobby, playing, ended, total: rooms.size };
}
