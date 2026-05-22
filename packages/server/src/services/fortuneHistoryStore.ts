/**
 * fortuneHistoryStore — v5.6.0 per-user daily fortune log.
 *
 * Every call to GET /api/fortune/me (post-deterministic-pick) fire-and-
 * forgets a record into this store. Because the pick is deterministic
 * per (userId, UTC date), recording is idempotent: a user opening the
 * page 5 times today only ever produces ONE history entry for today.
 *
 * On disk: packages/server/data/user_fortune_history.json
 *   { byUser: { userId: FortuneHistoryEntry[] } }
 *
 * Cap: 30 most recent entries per user (~1 month, headroom for monthly
 * recap card variants if v5.6.1 wants them). Older entries silently
 * dropped — fortune history is ephemeral entertainment, not legal record.
 *
 * Mirrors the pattern of squadHistoryStore.ts (v1.4.3): in-memory cache
 * + atomic file rename for persistence, single-loader init promise.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_fortune_history.json');

const MAX_PER_USER = 30;

export interface FortuneHistoryEntry {
  /** YYYY-MM-DD, the same date string returned by /api/fortune/me. */
  date: string;
  /** Card id from FORTUNE_DECK — recomputable via id, but we cache the
   *  display fields too so the history page doesn't need to re-join
   *  against the deck on every read. */
  cardId: string;
  emoji: string;
  title: string;
  vibeScore: number;
  /** Tag for affinity stats ("today was 3 days of grind cards in a row"). */
  tag: string;
}

interface StoreShape {
  byUser: Record<string, FortuneHistoryEntry[]>;
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
    console.error('[fortuneHistoryStore] load failed:', err);
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

/** Idempotent — if the user already has an entry for `entry.date`,
 *  skip (a repeat-open same day produces no new record). Newest first. */
export async function recordFortuneDraw(userId: string, entry: FortuneHistoryEntry): Promise<void> {
  if (!userId) return;
  const s = await ensureLoaded();
  if (!s.byUser[userId]) s.byUser[userId] = [];
  const list = s.byUser[userId];
  if (list.some((e) => e.date === entry.date)) return;
  list.unshift(entry);
  if (list.length > MAX_PER_USER) list.length = MAX_PER_USER;
  await persist(s).catch((err) => {
    // Persistence failure shouldn't break the user request — log + move on.
    // The in-memory cache stays consistent for this process lifetime.
    console.error('[fortuneHistoryStore] persist failed:', err);
  });
}

/** Last N entries for a user, newest first. Default N=7 = last week. */
export async function listUserFortuneHistory(userId: string, limit = 7): Promise<FortuneHistoryEntry[]> {
  if (!userId) return [];
  const s = await ensureLoaded();
  const list = s.byUser[userId] ?? [];
  return list.slice(0, limit);
}
