/**
 * userCharacterViewsStore — v6.10 per-user × per-character view ledger.
 *
 * Different from characterStatsStore (global per-character lifetime
 * stats) — this one is INDEXED BY userId and answers questions like
 * "which 3 rats has THIS user watched most?" for the personalized
 * TopRatsPanel on /profile.
 *
 * Shape on disk: packages/server/data/user_character_views.json
 *   {
 *     byUser: {
 *       "u-abc123": {
 *         Tony: { views: 8, winsWatched: 5, lossesWatched: 3, lastAt: ... },
 *         Lisa: { views: 3, winsWatched: 2, lossesWatched: 1, lastAt: ... },
 *         ...
 *       },
 *       ...
 *     }
 *   }
 *
 * Update model: at GAME_OVER, if engine.spectatorUserId is non-null,
 * the engine calls recordSpectatorViews(userId, state). We bump
 * `views` for every player in the final roster (alive AND dead, since
 * the spectator watched them all) and route to winsWatched /
 * lossesWatched based on the player's team vs the winning team.
 *
 * Atomic write (.tmp + rename) + fail-safe error swallow — view
 * tracking is polish and must not block game progression.
 *
 * Read API: getTopForUser(userId, n=3) returns the top `n` rats this
 * user has watched (sorted by views desc). Powers the v6.10
 * personalized "你看过的 Top 3" Profile panel.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState } from '@furball/shared';
import { Team, WinCondition } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_character_views.json');

export interface PerCharacterView {
  /** How many games this user has watched this character play in. */
  views: number;
  /** Of those games, how many did the character win. */
  winsWatched: number;
  /** And how many did the character lose. (neutral games don't
   *  increment either — they count toward views but not wins/losses.) */
  lossesWatched: number;
  /** Unix ms of the last update — UI freshness signal. */
  lastAt: number;
}

interface UserViews {
  [characterName: string]: PerCharacterView;
}

/** v6.11 — per-event log for trend analysis. One push per (spectator,
 *  character) at GAME_OVER. Capped at 200 most-recent events per user
 *  to bound the JSON file size; 30-day windows query rarely exceed this. */
export interface ViewEvent {
  ts: number;
  characterName: string;
  personality?: string;
  /** true = the character was on the winning team this game. */
  won: boolean;
}

const MAX_EVENTS_PER_USER = 200;

interface StoreShape {
  byUser: Record<string, UserViews>;
  /** v6.11 — recent event log, keyed by userId. May be missing entirely on
   *  files written by v6.10 (in-place migration on first write). */
  events?: Record<string, ViewEvent[]>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byUser || typeof parsed.byUser !== 'object') return { byUser: {}, events: {} };
    return { byUser: parsed.byUser, events: parsed.events ?? {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byUser: {}, events: {} };
    console.error('[userCharacterViewsStore] load failed:', err);
    return { byUser: {}, events: {} };
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

/**
 * Fold a finished game into this user's per-character ledger.
 * Called from GameEngine at GAME_OVER only when spectatorUserId is set.
 *
 * @param userId  spectator's stable userId
 * @param state   final GameState — used to read players + winner team
 */
export async function recordSpectatorViews(
  userId: string,
  state: GameState,
): Promise<void> {
  if (!userId) return;
  try {
    const s = await ensureLoaded();
    if (!s.byUser[userId]) s.byUser[userId] = {};
    const userLedger = s.byUser[userId];
    const winningTeam =
      state.winner === WinCondition.CAT_WIN ? Team.CAT
      : state.winner === WinCondition.DOG_WIN ? Team.DOG
      : null;
    const now = Date.now();

    // v6.11 — also push an event per character. Lazy-init the events
    // map if this file was written by v6.10 (no events field).
    if (!s.events) s.events = {};
    if (!s.events[userId]) s.events[userId] = [];
    const userEvents = s.events[userId];

    for (const p of state.players) {
      const entry = userLedger[p.name] ?? {
        views: 0, winsWatched: 0, lossesWatched: 0, lastAt: 0,
      };
      entry.views += 1;
      const won = !!(winningTeam && p.team === winningTeam);
      if (winningTeam) {
        if (p.team === winningTeam) entry.winsWatched += 1;
        else if (p.team === Team.CAT || p.team === Team.DOG) entry.lossesWatched += 1;
        // neutral team in a CAT/DOG-win game: views++ only, no W/L
      }
      entry.lastAt = now;
      userLedger[p.name] = entry;

      userEvents.push({
        ts: now,
        characterName: p.name,
        personality: p.personality,
        won,
      });
    }
    // Cap events buffer — keep most-recent MAX_EVENTS_PER_USER. Cheap O(n)
    // each call; happens once per game which is fine.
    if (userEvents.length > MAX_EVENTS_PER_USER) {
      s.events[userId] = userEvents.slice(-MAX_EVENTS_PER_USER);
    }
    await persist(s);
  } catch (err) {
    // Polish layer — never let view tracking block the game.
    console.error('[userCharacterViewsStore] recordSpectatorViews failed:', err);
  }
}

/**
 * Return the user's top `n` watched rats, sorted by views desc. Empty
 * array when the user has watched 0 games yet (callers should
 * fall back to global TopRats).
 */
export async function getTopForUser(
  userId: string,
  n = 3,
): Promise<Array<{ name: string } & PerCharacterView>> {
  if (!userId) return [];
  const s = await ensureLoaded();
  const ledger = s.byUser[userId];
  if (!ledger) return [];
  return Object.entries(ledger)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, n)
    .map(([name, view]) => ({ name, ...view }));
}

/** Return the full ledger for a user. Used by /api/characters/me. */
export async function getUserViews(userId: string): Promise<UserViews> {
  if (!userId) return {};
  const s = await ensureLoaded();
  return s.byUser[userId] ?? {};
}

/**
 * v6.11 — personality trend summary over the last N days. Aggregates
 * `viewEvents` into personality counts (across all characters this user
 * watched in the window). Returns:
 *   - dominantPersonality: top-count id (null when window empty)
 *   - personalityCounts: full breakdown for client viz
 *   - totalEvents: how many character-views fell into the window
 *   - rawEvents: the actual event entries in the window (for SVG trend
 *     line in a future v6.12)
 */
export interface ViewTrendSummary {
  windowDays: number;
  totalEvents: number;
  dominantPersonality: string | null;
  personalityCounts: Record<string, number>;
  rawEvents: ViewEvent[];
}

export async function getUserTrend(
  userId: string,
  windowDays = 30,
): Promise<ViewTrendSummary> {
  const empty: ViewTrendSummary = {
    windowDays, totalEvents: 0, dominantPersonality: null,
    personalityCounts: {}, rawEvents: [],
  };
  if (!userId) return empty;
  const s = await ensureLoaded();
  const events = s.events?.[userId] ?? [];
  if (events.length === 0) return empty;

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = events.filter((e) => e.ts >= cutoff);
  if (inWindow.length === 0) return { ...empty, totalEvents: 0 };

  const counts: Record<string, number> = {};
  for (const e of inWindow) {
    if (!e.personality) continue;
    counts[e.personality] = (counts[e.personality] ?? 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    windowDays,
    totalEvents: inWindow.length,
    dominantPersonality: dominant,
    personalityCounts: counts,
    rawEvents: inWindow,
  };
}
