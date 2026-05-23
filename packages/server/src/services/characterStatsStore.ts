/**
 * characterStatsStore — v6.8 per-character (Tony/Lisa/...) lifetime
 * stats backing the PersonaCard "战绩" line. Different from
 * squadHistoryStore (which is keyed by human userId for the squad
 * recap page) — this one is keyed by CHARACTER name and accumulates
 * across every classic-mode game the server has ever run.
 *
 * Shape on disk: packages/server/data/character_stats.json
 *   {
 *     byName: {
 *       Tony: {
 *         totalGames, wins, votedOut, suspicionsReceived,
 *         personalityCounts: { workaholic: 3, introvert: 1, ... },
 *         lastGameId, lastAt
 *       },
 *       ...
 *     }
 *   }
 *
 * Update model: at GAME_OVER, the engine calls recordGameResults() once
 * with the full final state — every player gets their counters bumped.
 * The store handles atomic write (.tmp + rename) so a crash mid-write
 * can't corrupt the file.
 *
 * Read API: getCharacterStats(name) returns the full record or null.
 * Used by GET /api/characters/:name HTTP route.
 *
 * Failure mode: this store is best-effort polish. If disk I/O fails, we
 * log + continue — the game never blocks on stats persistence.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState, PlayerState } from '@furball/shared';
import { Team, WinCondition } from '@furball/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'character_stats.json');

export interface CharacterStats {
  /** Total games this character has played (counted once per game). */
  totalGames: number;
  /** Games this character was on the winning team. */
  wins: number;
  /** Games this character was voted out (any round). */
  votedOut: number;
  /** Total votes received against this character, accumulated across
   *  every voting round of every game. (e.g. 3 games × 2 rounds × 2
   *  votes-against = 12.) High value = often suspected. */
  suspicionsReceived: number;
  /** How often each personality was assigned. The dominant key is the
   *  "favorite personality" for this character. */
  personalityCounts: Record<string, number>;
  /** Last game id this character played in — UI freshness signal. */
  lastGameId: string;
  /** Unix ms of the last update. */
  lastAt: number;
}

interface StoreShape {
  byName: Record<string, CharacterStats>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

function emptyStats(): CharacterStats {
  return {
    totalGames: 0,
    wins: 0,
    votedOut: 0,
    suspicionsReceived: 0,
    personalityCounts: {},
    lastGameId: '',
    lastAt: 0,
  };
}

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byName || typeof parsed.byName !== 'object') return { byName: {} };
    return { byName: parsed.byName };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byName: {} };
    console.error('[characterStatsStore] load failed:', err);
    return { byName: {} };
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
 * v6.8 — fold the final game state into stats. Called from GameEngine
 * once at GAME_OVER. Counts each player (alive AND dead) once. Reads
 * the full state's `votes` history for vote totals is NOT possible
 * (engine only retains current-round votes), so suspicionsReceived
 * comes from the running tally maintained throughout the game via
 * recordVoteAgainst().
 */
export async function recordGameResults(state: GameState): Promise<void> {
  try {
    const s = await ensureLoaded();
    const winningTeam =
      state.winner === WinCondition.CAT_WIN ? Team.CAT
      : state.winner === WinCondition.DOG_WIN ? Team.DOG
      : null;

    for (const p of state.players) {
      if (!s.byName[p.name]) s.byName[p.name] = emptyStats();
      const rec = s.byName[p.name];
      rec.totalGames += 1;
      if (winningTeam && p.team === winningTeam) rec.wins += 1;
      if (!p.isAlive) rec.votedOut += 1;
      if (p.personality) {
        rec.personalityCounts[p.personality] =
          (rec.personalityCounts[p.personality] ?? 0) + 1;
      }
      rec.lastGameId = state.id;
      rec.lastAt = Date.now();
    }
    await persist(s);
  } catch (err) {
    // Stats are polish — never let them block game progression.
    console.error('[characterStatsStore] recordGameResults failed:', err);
  }
}

/**
 * Bump suspicion counters mid-game — called from runVoting once per
 * vote cast (each voter contributes +1 to their target's tally).
 *
 * Why separate from recordGameResults? Game-end is too late to see
 * intermediate vote counts (engine clears `state.votes` each round).
 * Calling this from runVoting ensures every vote-against is captured
 * even if the target survives the vote.
 */
export async function recordVoteAgainst(
  targetName: string,
  gameId: string,
): Promise<void> {
  try {
    const s = await ensureLoaded();
    if (!s.byName[targetName]) s.byName[targetName] = emptyStats();
    s.byName[targetName].suspicionsReceived += 1;
    s.byName[targetName].lastGameId = gameId;
    s.byName[targetName].lastAt = Date.now();
    await persist(s);
  } catch (err) {
    console.error('[characterStatsStore] recordVoteAgainst failed:', err);
  }
}

export async function getCharacterStats(name: string): Promise<CharacterStats | null> {
  const s = await ensureLoaded();
  return s.byName[name] ?? null;
}

export async function getAllCharacterStats(): Promise<Record<string, CharacterStats>> {
  const s = await ensureLoaded();
  return s.byName;
}
