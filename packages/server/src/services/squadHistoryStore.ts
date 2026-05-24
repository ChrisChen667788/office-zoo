/**
 * squadHistoryStore — v1.4.3 per-user attendance log for squad sessions.
 *
 * When a squad ends, we snapshot the room (members + recap + acts
 * metadata only — not full beats, since the playable room object lives
 * in squadHandler's in-mem store for 30 min anyway) and append to every
 * member's history list.
 *
 * The persistence shape is keyed by userId so the "/我的攒局" page can
 * fetch one user's history with a single round-trip. Group leaderboards
 * are derivable client-side by hashing sorted member-id sets across the
 * list (same friend group across multiple sessions = same hash).
 *
 * On disk: packages/server/data/user_squad_history.json
 *   { byUser: { userId: SquadHistoryEntry[] } }
 *
 * Cap: 50 most recent entries per user (older entries silently dropped).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SquadMember, SquadRecap } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_squad_history.json');

const MAX_PER_USER = 50;

export interface SquadHistoryEntry {
  /** Original room id at end-time. Lets the user / client deeplink back
   *  while the room is still in the 30-min post-ended TTL window. */
  roomId: string;
  /** Unix ms when the room ended. */
  endedAt: number;
  /** Cached member roster — display names + archetypes, so the history
   *  page renders without re-resolving profiles. */
  members: Array<Pick<SquadMember, 'userId' | 'displayName' | 'archetypeId' | 'archetypeName' | 'archetypeEmoji'>>;
  /** Recap from the LLM director. Omitted only if the room ended via
   *  TTL with no recap (shouldn't normally happen). */
  recap?: SquadRecap;
  /** How many acts the director generated. Acts themselves not stored
   *  (room kept 30 min for deeplink re-read; long-term history is just
   *  the recap card). */
  actCount: number;
  /** Optional host-supplied scenario brief. */
  scenarioBrief?: string;
}

interface StoreShape {
  byUser: Record<string, SquadHistoryEntry[]>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byUser || typeof parsed.byUser !== 'object') return { byUser: {} };
    return { byUser: parsed.byUser };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byUser: {} };
    console.error('[squadHistoryStore] load failed:', err);
    return { byUser: {} };
  }
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((s) => { cache = s; return s; });
  return loadPromise;
}

async function persist(state: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** Append the same entry to every member's history. Idempotent — if a
 *  user already has an entry for this roomId, skip (handles the case
 *  where the squad handler's "ended" transition fires twice from a
 *  race + a manual squad:rerun). */
export async function recordSquadEnd(entry: SquadHistoryEntry): Promise<void> {
  const s = await ensureLoaded();
  for (const m of entry.members) {
    if (!s.byUser[m.userId]) s.byUser[m.userId] = [];
    const list = s.byUser[m.userId];
    if (list.some((e) => e.roomId === entry.roomId)) continue;
    list.unshift(entry); // newest first
    if (list.length > MAX_PER_USER) list.length = MAX_PER_USER;
  }
  await persist(s);
}

export async function listUserSquadHistory(userId: string): Promise<SquadHistoryEntry[]> {
  const s = await ensureLoaded();
  return s.byUser[userId] ?? [];
}

/**
 * v6.11 P3 — aggregate squad attendance for one user. Returns counts +
 * top co-members (people they squad with most often). Powers
 * SquadMemberCard's "参加过 N 局攒局" line.
 *
 * `totalSessions` is bounded by the store's MAX_PER_USER cap (50). For
 * heavy users that's a soft floor; we surface it honestly as "N+ 局" in
 * the UI when at the cap.
 */
export interface UserSquadStats {
  totalSessions: number;
  cappedAt50: boolean;
  last7Days: number;
  last30Days: number;
  /** Top 3 co-members by shared-session count, with displayName cached
   *  from the entry. Excludes the queried user. */
  topCoMembers: Array<{
    userId: string;
    displayName: string;
    sharedSessions: number;
  }>;
}

export async function getSquadStatsFor(userId: string): Promise<UserSquadStats> {
  const s = await ensureLoaded();
  const list = s.byUser[userId] ?? [];
  const now = Date.now();
  const D1 = 24 * 60 * 60 * 1000;
  const last7Days = list.filter((e) => now - e.endedAt < 7 * D1).length;
  const last30Days = list.filter((e) => now - e.endedAt < 30 * D1).length;

  // Cross-tabulate co-members. Map userId → { displayName, count }.
  const coCount = new Map<string, { displayName: string; count: number }>();
  for (const entry of list) {
    for (const m of entry.members) {
      if (m.userId === userId) continue;
      const cur = coCount.get(m.userId);
      if (cur) cur.count += 1;
      else coCount.set(m.userId, { displayName: m.displayName, count: 1 });
    }
  }
  const topCoMembers = [...coCount.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([userId, v]) => ({
      userId, displayName: v.displayName, sharedSessions: v.count,
    }));

  return {
    totalSessions: list.length,
    cappedAt50: list.length >= MAX_PER_USER,
    last7Days,
    last30Days,
    topCoMembers,
  };
}
