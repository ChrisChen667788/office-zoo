/**
 * voteDuelStore — v6.18 P3 1v1 vote duel.
 *
 * Two users each pick BALLOT_SIZE (rat, personality) pairs. At any time
 * after both ballots are filled, scores are computed live by comparing
 * each pick to the current /votes/leaders for that rat. Score = # of
 * picks where (rat, personality) matches the current dominant.
 *
 * Persistence: JSON file at packages/server/data/vote_duels.json,
 * capped at MAX_DUELS_KEPT most-recent by createdAt.
 *
 * Lifecycle:
 *   1. Host POST /duels { ballot } → { duelId, shareUrl }
 *   2. Guest opens shareUrl → GET /duels/:id (host ballot visible)
 *   3. Guest POST /duels/:id/join { ballot }
 *   4. From now on, GET /:id returns live scores from /votes/leaders.
 *
 * Anti-griefing:
 *   - 1 ballot per (user, duel) — can't overwrite once joined
 *   - duelId is 12-char base36 random → not guessable
 *   - Self-duel allowed (host can also be guest, useful for solo
 *     "lock in 3 picks then 3 more" practice). Not actively encouraged.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentWeekKey, getWeeklyLeaders } from './characterVoteStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE  = path.join(DATA_DIR, 'vote_duels.json');

const MAX_DUELS_KEPT = 500;
export const BALLOT_SIZE = 3;

export interface BallotPick {
  rat: string;
  personality: string;
}

export interface DuelData {
  duelId: string;
  weekKey: string;
  createdAt: number;
  hostUserId: string;
  hostBallot: BallotPick[];
  guestUserId?: string;
  guestBallot?: BallotPick[];
  joinedAt?: number;
}

interface StoreShape {
  byId: Record<string, DuelData>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.byId || typeof parsed.byId !== 'object') return { byId: {} };
    return { byId: parsed.byId };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { byId: {} };
    console.error('[voteDuelStore] load failed:', err);
    return { byId: {} };
  }
}
async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((s) => { cache = s; return s; });
  return loadPromise;
}
async function persist(s: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

/** Cap to MAX_DUELS_KEPT — drop oldest by createdAt. Called pre-persist
 *  whenever a new duel is created. */
function evictOldDuels(s: StoreShape): void {
  const all = Object.values(s.byId).sort((a, b) => b.createdAt - a.createdAt);
  if (all.length <= MAX_DUELS_KEPT) return;
  for (const d of all.slice(MAX_DUELS_KEPT)) delete s.byId[d.duelId];
}

function randomDuelId(): string {
  // 12 base36 chars ≈ 62 bits entropy. Plenty.
  let s = '';
  while (s.length < 12) {
    s += Math.random().toString(36).slice(2);
  }
  return s.slice(0, 12);
}

function validateBallot(ballot: unknown): { ok: true; picks: BallotPick[] } | { ok: false; reason: string } {
  if (!Array.isArray(ballot)) return { ok: false, reason: 'ballot must be array' };
  if (ballot.length !== BALLOT_SIZE) return { ok: false, reason: `ballot must have ${BALLOT_SIZE} picks` };
  const picks: BallotPick[] = [];
  const seenRats = new Set<string>();
  for (const p of ballot) {
    if (typeof p !== 'object' || p === null) return { ok: false, reason: 'pick must be object' };
    const { rat, personality } = p as { rat?: unknown; personality?: unknown };
    if (typeof rat !== 'string' || typeof personality !== 'string') {
      return { ok: false, reason: 'pick.rat and .personality must be strings' };
    }
    if (seenRats.has(rat)) return { ok: false, reason: `duplicate rat in ballot: ${rat}` };
    seenRats.add(rat);
    picks.push({ rat, personality });
  }
  return { ok: true, picks };
}

export async function createDuel(hostUserId: string, ballot: unknown): Promise<{ ok: true; duel: DuelData } | { ok: false; reason: string }> {
  if (!hostUserId) return { ok: false, reason: 'missing host userId' };
  const v = validateBallot(ballot);
  if (!v.ok) return { ok: false, reason: v.reason };
  const s = await ensureLoaded();
  const duel: DuelData = {
    duelId: randomDuelId(),
    weekKey: currentWeekKey(),
    createdAt: Date.now(),
    hostUserId,
    hostBallot: v.picks,
  };
  s.byId[duel.duelId] = duel;
  evictOldDuels(s);
  await persist(s);
  return { ok: true, duel };
}

export async function joinDuel(duelId: string, guestUserId: string, ballot: unknown): Promise<{ ok: true; duel: DuelData } | { ok: false; reason: string }> {
  if (!duelId || !guestUserId) return { ok: false, reason: 'missing fields' };
  const v = validateBallot(ballot);
  if (!v.ok) return { ok: false, reason: v.reason };
  const s = await ensureLoaded();
  const duel = s.byId[duelId];
  if (!duel) return { ok: false, reason: 'duel not found' };
  if (duel.guestBallot) return { ok: false, reason: 'duel already joined' };
  duel.guestUserId = guestUserId;
  duel.guestBallot = v.picks;
  duel.joinedAt = Date.now();
  await persist(s);
  return { ok: true, duel };
}

export async function getDuel(duelId: string): Promise<DuelData | null> {
  const s = await ensureLoaded();
  return s.byId[duelId] ?? null;
}

/**
 * Compute live scores for a duel against the current /votes/leaders.
 * Returns null when either ballot is missing.
 */
export interface DuelScores {
  hostScore: number;
  guestScore: number;
  perPickHost: Array<{ rat: string; personality: string; matched: boolean; currentDominant: string | null }>;
  perPickGuest: Array<{ rat: string; personality: string; matched: boolean; currentDominant: string | null }>;
  leadersWeekKey: string;
}

export async function scoreDuel(duel: DuelData): Promise<DuelScores | null> {
  if (!duel.guestBallot) return null;
  const leaders = await getWeeklyLeaders();
  const evalPick = (p: BallotPick) => ({
    rat: p.rat, personality: p.personality,
    currentDominant: leaders.leaders[p.rat] ?? null,
    matched: leaders.leaders[p.rat] === p.personality,
  });
  const perPickHost = duel.hostBallot.map(evalPick);
  const perPickGuest = duel.guestBallot.map(evalPick);
  return {
    hostScore: perPickHost.filter((p) => p.matched).length,
    guestScore: perPickGuest.filter((p) => p.matched).length,
    perPickHost, perPickGuest,
    leadersWeekKey: leaders.weekKey,
  };
}
