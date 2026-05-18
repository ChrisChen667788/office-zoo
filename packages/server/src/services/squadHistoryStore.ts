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
