/**
 * characterVoteStore — v6.16 P1 weekly character personality vote.
 *
 * Users vote for which personality each rat should "show up as" in the
 * upcoming week. Closes the loop with v6.6 self-tuning (weekly preference
 * tuning) but at the CHARACTER level — gives users a stake in who Tony
 * acts like next week, not just in their personal LLM style mix.
 *
 * Ballot rules:
 *   - 1 vote per (user, character, week)
 *   - Re-voting OVERWRITES (we're tracking opinion, not turnout)
 *   - Week boundary = Monday 00:00 server-local; mid-week opens a fresh ballot
 *
 * Shape on disk: packages/server/data/character_votes.json
 *   {
 *     "byWeek": {
 *       "2026-W21": {
 *         "byCharacter": {
 *           "Tony": { "votes": { "workaholic": 12, ... }, "totalVotes": 15 }
 *         },
 *         "byUserBallot": {
 *           "u-abc123": { "Tony": "workaholic", "Lisa": "introvert" }
 *         }
 *       }
 *     }
 *   }
 *
 * History bounded: keep most recent 8 weeks (~2 months of ballots);
 * older weeks evicted at write time.
 *
 * Engine bias (consumer side, server/engine/GameEngine.ts): at game
 * creation, getWeeklyLeader(name) returns the most-voted personality.
 * That can be passed in as a 50% bias when assignPersonalities deals
 * the per-player personality. v6.16 ships the store + UI; engine bias
 * wiring is a v6.17 follow-up (independent change, no API churn).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE  = path.join(DATA_DIR, 'character_votes.json');

const MAX_WEEKS_KEPT = 8;

export interface CharacterVoteTally {
  votes: Record<string, number>;  // personality id → count
  totalVotes: number;
}

interface WeekData {
  byCharacter: Record<string, CharacterVoteTally>;
  byUserBallot: Record<string, Record<string, string>>;
}

interface StoreShape {
  byWeek: Record<string, WeekData>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byWeek || typeof parsed.byWeek !== 'object') return { byWeek: {} };
    return { byWeek: parsed.byWeek };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byWeek: {} };
    console.error('[characterVoteStore] load failed:', err);
    return { byWeek: {} };
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
 * ISO-week key like "2026-W21". Server-local timezone (matches the
 * Daily Featured Rat algorithm). For UTC-strict deploys swap to UTC
 * date math here; product is China-targeted so server-local is right.
 */
export function currentWeekKey(date = new Date()): string {
  // Find Thursday of this week (ISO 8601 anchor) to compute year-week.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Get day of week (Mon=0, Sun=6 per ISO)
  const dayNr = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function evictOldWeeks(s: StoreShape): void {
  const weeks = Object.keys(s.byWeek).sort();
  if (weeks.length <= MAX_WEEKS_KEPT) return;
  const drop = weeks.slice(0, weeks.length - MAX_WEEKS_KEPT);
  for (const w of drop) delete s.byWeek[w];
}

/**
 * Cast (or overwrite) the user's ballot for a character this week.
 * Returns { previousPersonality } if user had voted before — caller
 * can show "你已经把 Tony 改成 introvert 了" feedback.
 */
export async function castVote(
  userId: string,
  characterName: string,
  personality: string,
  weekKey = currentWeekKey(),
): Promise<{ ok: true; previousPersonality?: string } | { ok: false; reason: string }> {
  if (!userId || !characterName || !personality) {
    return { ok: false, reason: 'missing required fields' };
  }
  try {
    const s = await ensureLoaded();
    if (!s.byWeek[weekKey]) s.byWeek[weekKey] = { byCharacter: {}, byUserBallot: {} };
    const week = s.byWeek[weekKey];
    if (!week.byUserBallot[userId]) week.byUserBallot[userId] = {};
    const prevPersonality = week.byUserBallot[userId][characterName];

    // Decrement prev tally if any
    if (prevPersonality) {
      const tally = week.byCharacter[characterName];
      if (tally) {
        tally.votes[prevPersonality] = Math.max(0, (tally.votes[prevPersonality] ?? 1) - 1);
        tally.totalVotes = Math.max(0, tally.totalVotes - 1);
        if (tally.votes[prevPersonality] === 0) delete tally.votes[prevPersonality];
      }
    }

    // Apply new tally
    if (!week.byCharacter[characterName]) {
      week.byCharacter[characterName] = { votes: {}, totalVotes: 0 };
    }
    const tally = week.byCharacter[characterName];
    tally.votes[personality] = (tally.votes[personality] ?? 0) + 1;
    tally.totalVotes += 1;
    week.byUserBallot[userId][characterName] = personality;

    evictOldWeeks(s);
    await persist(s);
    return { ok: true, previousPersonality: prevPersonality };
  } catch (err) {
    console.error('[characterVoteStore] castVote failed:', err);
    return { ok: false, reason: 'persist failed' };
  }
}

export async function getCharacterVotes(
  name: string,
  weekKey = currentWeekKey(),
): Promise<{ tally: CharacterVoteTally; dominant: string | null; weekKey: string }> {
  const s = await ensureLoaded();
  const tally = s.byWeek[weekKey]?.byCharacter?.[name] ?? { votes: {}, totalVotes: 0 };
  const dominant = Object.entries(tally.votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { tally, dominant, weekKey };
}

export async function getUserBallot(
  userId: string,
  weekKey = currentWeekKey(),
): Promise<{ ballot: Record<string, string>; weekKey: string }> {
  if (!userId) return { ballot: {}, weekKey };
  const s = await ensureLoaded();
  const ballot = s.byWeek[weekKey]?.byUserBallot?.[userId] ?? {};
  return { ballot, weekKey };
}

/**
 * v6.17 P2 — return the last `weeks` weeks' winning personality for one
 * character. Used by CharacterVoteModal's history strip and Profile
 * MyBallots cross-tab. Returns oldest → newest.
 *
 * Missing weeks (gap in voting history) → not included; caller may want
 * to backfill with `null` if a contiguous timeline is needed.
 */
export interface CharacterWeekHistory {
  weekKey: string;
  dominant: string | null;
  totalVotes: number;
}

export async function getCharacterHistory(
  name: string,
  weeks = 4,
): Promise<CharacterWeekHistory[]> {
  const s = await ensureLoaded();
  const all = Object.keys(s.byWeek).sort(); // chronological
  // Take the most recent `weeks` weeks that have data, oldest → newest.
  const sliced = all.slice(-weeks);
  return sliced.map((weekKey) => {
    const tally = s.byWeek[weekKey]?.byCharacter?.[name];
    if (!tally) return { weekKey, dominant: null, totalVotes: 0 };
    const dominant = Object.entries(tally.votes)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { weekKey, dominant, totalVotes: tally.totalVotes };
  });
}

export async function getWeeklyLeaders(
  weekKey = currentWeekKey(),
): Promise<{ leaders: Record<string, string>; weekKey: string }> {
  const s = await ensureLoaded();
  const week = s.byWeek[weekKey];
  if (!week) return { leaders: {}, weekKey };
  const leaders: Record<string, string> = {};
  for (const [name, tally] of Object.entries(week.byCharacter)) {
    const top = Object.entries(tally.votes).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) leaders[name] = top;
  }
  return { leaders, weekKey };
}
