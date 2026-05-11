/**
 * firedRoomHandler — v0.9.3 真人 vs HR PvP 房间.
 *
 * Two players, one socket room. The "worker" creates a room around a
 * scenario; the "hr" friend joins via a shareable link and role-plays
 * the HR side instead of the LLM. No scoring, no LLM, no rate limits
 * (gated by the create flow which DOES go through the rate limiter).
 *
 * Wire events (all under `room:` namespace):
 *   inbound:
 *     room:create  { scenarioId }                  → worker
 *     room:join    { roomId, role }                → either side rejoining
 *     room:say     { roomId, content }             → either side
 *     room:typing  { roomId, isTyping }            → either side
 *     room:end     { roomId, outcome? }            → either side ends round
 *   outbound (to room):
 *     room:state   full snapshot, fired on every state change
 *     room:message new message append
 *     room:typing  peer typing indicator
 *     room:peer    peer joined / left
 *     room:ended   round closed (with outcome label)
 *     room:error   any rejection (validation, capacity, missing room, etc)
 *
 * Storage: `Map<roomId, Room>` in-memory. 24-hour hard TTL via the same
 * sweeper pattern the main game engine uses. Restart loses all rooms —
 * acceptable for an MVP since the link is just a deeplink, no state to
 * recover beyond the scenario identifier.
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { validateEvent } from '../utils/validate';
import { SCENARIOS as FIRED_SCENARIOS, type FiredScenario } from '@furball/shared';
import { findUserScenario } from '../services/scenarioStore';

const log = logger.child({ component: 'firedRoom' });

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const RoleSchema = z.enum(['worker', 'hr']);

const RoomCreateSchema = z.object({
  scenarioId: z.string().min(1).max(64),
});
const RoomJoinSchema = z.object({
  roomId: z.string().min(1).max(64),
  role:   RoleSchema,
});
const RoomSaySchema = z.object({
  roomId:  z.string().min(1).max(64),
  content: z.string().min(1).max(800),
});
const RoomTypingSchema = z.object({
  roomId:   z.string().min(1).max(64),
  isTyping: z.boolean(),
});
const RoomEndSchema = z.object({
  roomId:  z.string().min(1).max(64),
  outcome: z.enum(['worker_win', 'hr_win', 'draw']).optional(),
});

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------
type RoomMessage = {
  /** Server-stamped client id used for stable React keys + receipt traces. */
  id: string;
  /** Which seat sent it. */
  role: 'worker' | 'hr';
  content: string;
  ts: number;
};

interface Room {
  id: string;
  scenarioId: string;
  scenario: FiredScenario;
  /** sids — null when that seat is empty (peer disconnected, hasn't joined yet). */
  workerSid: string | null;
  hrSid:     string | null;
  messages:  RoomMessage[];
  createdAt: number;
  /** Set by room:end. Once set, subsequent messages are rejected. */
  endedOutcome: 'worker_win' | 'hr_win' | 'draw' | null;
}

const rooms = new Map<string, Room>();

// 24-hour hard TTL — sweep every 30 minutes.
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const TTL_SWEEP_INTERVAL_MS = 30 * 60 * 1000;

let sweeperStarted = false;
function startTTLSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms) {
      if (now - room.createdAt > ROOM_TTL_MS) {
        rooms.delete(id);
        log.info({ roomId: id }, 'PvP room TTL expired');
      }
    }
  }, TTL_SWEEP_INTERVAL_MS).unref();
}

// Read-only snapshot for /api/health debugging.
export function getRoomStats() {
  return {
    activeRooms: rooms.size,
    occupiedSeats: [...rooms.values()].reduce(
      (acc, r) => acc + (r.workerSid ? 1 : 0) + (r.hrSid ? 1 : 0),
      0,
    ),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function lookupScenario(id: string): Promise<FiredScenario | null> {
  const seed = FIRED_SCENARIOS.find((s) => s.id === id);
  if (seed) return seed;
  const user = await findUserScenario(id);
  return user ?? null;
}

function mintRoomId(): string {
  // 6 base36 chars → ~2B combinations. Same scheme as bit-u-… / pack-u-….
  const rnd = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `room-${rnd}`;
}

function mintMsgId(): string {
  return `m-${Math.random().toString(36).slice(2, 10)}`;
}

/** Snapshot a room for the client. Strips sids (server-internal). */
function snapshotRoom(room: Room) {
  return {
    id:           room.id,
    scenarioId:   room.scenarioId,
    scenario:     room.scenario,
    messages:     room.messages,
    workerJoined: room.workerSid !== null,
    hrJoined:     room.hrSid !== null,
    endedOutcome: room.endedOutcome,
    createdAt:    room.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function setupFiredRoomHandler(io: SocketServer) {
  startTTLSweeper();

  io.on('connection', (socket: Socket) => {
    /** Tracks which room (if any) this socket is sitting in. Lets the
     *  disconnect handler clean up the right seat without scanning all rooms. */
    let mySeat: { roomId: string; role: 'worker' | 'hr' } | null = null;

    // ---------- room:create ------------------------------------------------
    socket.on('room:create', async (raw: unknown) => {
      const v = validateEvent(RoomCreateSchema, raw);
      if (!v.ok) return socket.emit('room:error', { message: v.message });

      const scenario = await lookupScenario(v.data.scenarioId);
      if (!scenario) return socket.emit('room:error', { message: '剧本不存在' });

      const roomId = mintRoomId();
      const room: Room = {
        id:           roomId,
        scenarioId:   v.data.scenarioId,
        scenario,
        workerSid:    socket.id,
        hrSid:        null,
        messages:     [],
        createdAt:    Date.now(),
        endedOutcome: null,
      };
      rooms.set(roomId, room);

      socket.join(roomId);
      mySeat = { roomId, role: 'worker' };

      log.info({ roomId, scenarioId: scenario.id, sid: socket.id }, 'PvP room created');
      socket.emit('room:state', { ...snapshotRoom(room), me: 'worker' });
    });

    // ---------- room:join --------------------------------------------------
    socket.on('room:join', async (raw: unknown) => {
      const v = validateEvent(RoomJoinSchema, raw);
      if (!v.ok) return socket.emit('room:error', { message: v.message });

      const room = rooms.get(v.data.roomId);
      if (!room) return socket.emit('room:error', { message: '房间不存在或已过期' });

      if (v.data.role === 'worker') {
        // Worker re-join (refresh / second tab). If seat is already
        // occupied by a different socket, replace it (last-writer-wins;
        // the old socket gets a peer_left notice).
        if (room.workerSid && room.workerSid !== socket.id) {
          io.to(room.workerSid).emit('room:peer', { event: 'replaced' });
        }
        room.workerSid = socket.id;
      } else {
        // HR join. If the seat is taken by a different socket, reject —
        // we don't want a stranger evicting the actual HR mid-round.
        if (room.hrSid && room.hrSid !== socket.id) {
          return socket.emit('room:error', { message: 'HR 席位已被占用' });
        }
        room.hrSid = socket.id;
      }

      socket.join(room.id);
      mySeat = { roomId: room.id, role: v.data.role };

      // Tell the joiner everything; tell the other seat that we showed up.
      socket.emit('room:state', { ...snapshotRoom(room), me: v.data.role });
      const peerSid = v.data.role === 'worker' ? room.hrSid : room.workerSid;
      if (peerSid && peerSid !== socket.id) {
        io.to(peerSid).emit('room:peer', { event: 'joined', role: v.data.role });
      }
      log.info(
        { roomId: room.id, role: v.data.role, sid: socket.id },
        'PvP room joined',
      );
    });

    // ---------- room:say ---------------------------------------------------
    socket.on('room:say', (raw: unknown) => {
      const v = validateEvent(RoomSaySchema, raw);
      if (!v.ok) return socket.emit('room:error', { message: v.message });
      const room = rooms.get(v.data.roomId);
      if (!room)               return socket.emit('room:error', { message: '房间不存在' });
      if (room.endedOutcome)   return socket.emit('room:error', { message: '本轮已结束' });
      if (!mySeat || mySeat.roomId !== room.id) {
        return socket.emit('room:error', { message: '你不在这个房间' });
      }

      const msg: RoomMessage = {
        id: mintMsgId(),
        role: mySeat.role,
        content: v.data.content.trim(),
        ts: Date.now(),
      };
      room.messages.push(msg);
      // Cap at 60 messages so a long-running room doesn't accumulate.
      if (room.messages.length > 60) room.messages = room.messages.slice(-60);
      io.to(room.id).emit('room:message', msg);
    });

    // ---------- room:typing ------------------------------------------------
    socket.on('room:typing', (raw: unknown) => {
      const v = validateEvent(RoomTypingSchema, raw);
      if (!v.ok) return; // typing pings are noisy; silent reject is fine
      const room = rooms.get(v.data.roomId);
      if (!room || !mySeat || mySeat.roomId !== room.id) return;
      // Forward only to the OTHER seat (not echo back).
      const peerSid = mySeat.role === 'worker' ? room.hrSid : room.workerSid;
      if (peerSid) {
        io.to(peerSid).emit('room:typing', { isTyping: v.data.isTyping });
      }
    });

    // ---------- room:end ---------------------------------------------------
    socket.on('room:end', (raw: unknown) => {
      const v = validateEvent(RoomEndSchema, raw);
      if (!v.ok) return socket.emit('room:error', { message: v.message });
      const room = rooms.get(v.data.roomId);
      if (!room) return socket.emit('room:error', { message: '房间不存在' });
      if (room.endedOutcome) return; // idempotent

      room.endedOutcome = v.data.outcome ?? 'draw';
      io.to(room.id).emit('room:ended', { outcome: room.endedOutcome });
      log.info(
        { roomId: room.id, outcome: room.endedOutcome },
        'PvP round ended',
      );
      // Schedule cleanup 5 minutes later so reconnects can still pull
      // the final state for screenshot/share UX.
      setTimeout(() => rooms.delete(room.id), 5 * 60 * 1000).unref();
    });

    // ---------- disconnect -------------------------------------------------
    socket.on('disconnect', () => {
      if (!mySeat) return;
      const room = rooms.get(mySeat.roomId);
      if (!room) return;
      // Free the seat so a reconnect can take it back.
      if (mySeat.role === 'worker' && room.workerSid === socket.id) {
        room.workerSid = null;
      }
      if (mySeat.role === 'hr' && room.hrSid === socket.id) {
        room.hrSid = null;
      }
      // Tell the peer we're gone.
      const peerSid = mySeat.role === 'worker' ? room.hrSid : room.workerSid;
      if (peerSid) {
        io.to(peerSid).emit('room:peer', {
          event: 'left',
          role: mySeat.role,
        });
      }
    });
  });
}
