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

interface StoreShape {
  byUser: Record<string, UserViews>;
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
    console.error('[userCharacterViewsStore] load failed:', err);
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

    for (const p of state.players) {
      const entry = userLedger[p.name] ?? {
        views: 0, winsWatched: 0, lossesWatched: 0, lastAt: 0,
      };
      entry.views += 1;
      if (winningTeam) {
        if (p.team === winningTeam) entry.winsWatched += 1;
        else if (p.team === Team.CAT || p.team === Team.DOG) entry.lossesWatched += 1;
        // neutral team in a CAT/DOG-win game: views++ only, no W/L
      }
      entry.lastAt = now;
      userLedger[p.name] = entry;
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
