/**
 * dailyChallengeStore — v5.0.0 global daily challenge.
 *
 * Distinct from v4.0.0's pairwise challengeStore. Whereas that one
 * is "user A invited user B, here's their 1v1 comparison", THIS one
 * is "today the whole network is racing the same scenario, here's
 * the leaderboard".
 *
 * ## Why a separate store?
 *
 *  - Cardinality: pairwise = 2 fixed sides per challenge; global =
 *    N participants per day, may grow to many entries.
 *  - Lookup pattern: pairwise = O(1) by short code; global = O(1)
 *    by date + per-user dedup (best-of-day per user).
 *  - Lifecycle: pairwise = 24h TTL from creation; global = aligned
 *    to UTC date boundaries (today's challenge resets at UTC
 *    midnight; yesterday's archives for 7 days).
 *  - Scenario selection: pairwise's scenarioId comes from the
 *    challenger's finished round; global's scenarioId is a SINGLE
 *    server-wide pick per day (deterministic from the date so
 *    every user sees the same daily challenge).
 *
 * Forcing both into one store would mean two divergent code paths
 * + two divergent on-wire shapes. Two flat files is fine.
 *
 * ## Storage
 *
 * In-mem Map<dateYYYY-MM-DD, DailyChallengeDay>. Sweep keeps the
 * last 7 days; older auto-evicts. No disk persistence — daily
 * challenge is ephemeral viral content, not durable game state.
 * If we ever want long-term leaderboards we can add a JSON store
 * at that point.
 */

import { SCENARIOS as FIRED_SCENARIOS, type Archetype } from '@furball/shared';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface DailyChallengeParticipant {
  userId: string;
  displayName: string;
  archetypeId?: string;
  archetypeName?: string;
  archetypeEmoji?: string;
  compensationMonths: number;
  maxPossible: number;
  grade: Grade;
  tactic?: string;
  /** Unix ms — used for "5 minutes ago" relative time + best-of-day
   *  dedup (overwrite when a user replays with a better result). */
  ts: number;
}

export interface DailyChallengeDay {
  /** YYYY-MM-DD (UTC) — the date key. */
  date: string;
  /** Server-chosen scenario for this date. Same for everyone — that's
   *  what makes it a "global" challenge. Picked deterministically from
   *  the date so all clients agree without sync. */
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  /** Keyed by userId; one entry per user per day (best result wins
   *  via overwrite-on-improve). */
  participants: Map<string, DailyChallengeParticipant>;
}

const MAX_DAYS_RETAINED = 7;
const store = new Map<string, DailyChallengeDay>();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sweep older than 7 days. Cheap — called lazily on every read. */
function sweepExpired() {
  if (store.size <= MAX_DAYS_RETAINED) return;
  const sorted = [...store.keys()].sort(); // ISO dates sort lexically
  const toDrop = sorted.slice(0, store.size - MAX_DAYS_RETAINED);
  for (const k of toDrop) store.delete(k);
}

/** Hash the date into a deterministic scenario pick. Restricted to
 *  free (non-premium) scenarios so anonymous users can play today's
 *  challenge without paying. Same date → same scenario for every
 *  user globally; rolls over at UTC midnight. */
function pickDailyScenario(date: string): { id: string; title: string; emoji: string } {
  const free = FIRED_SCENARIOS.filter((s) => !s.premium);
  if (free.length === 0) {
    // Defensive — should never happen since we ship dozens of free
    // scenarios, but fall through to ANY scenario rather than throw.
    const any = FIRED_SCENARIOS[0];
    return { id: any.id, title: any.title, emoji: any.emoji };
  }
  // FNV-1a 32-bit hash of date string.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % free.length;
  const pick = free[idx];
  return { id: pick.id, title: pick.title, emoji: pick.emoji };
}

/** Get-or-create today's challenge day. Lazy bootstrap on first
 *  read of any date. */
function getOrCreateDay(date: string): DailyChallengeDay {
  let day = store.get(date);
  if (!day) {
    const scenario = pickDailyScenario(date);
    day = {
      date,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      scenarioEmoji: scenario.emoji,
      participants: new Map(),
    };
    store.set(date, day);
    sweepExpired();
  }
  return day;
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

/** Get today's globally-shared challenge metadata + (optionally) the
 *  current participant ranking. */
export interface DailyChallengeSummary {
  date: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  participantCount: number;
  /** Top-N participants by compensation ratio descending. Cap = 20
   *  so card stays readable. Includes the requesting user IF they're
   *  in the leaderboard, regardless of rank (caller can find their
   *  row by userId match). */
  topResults: DailyChallengeParticipant[];
  /** The requesting user's own entry, if they've played today.
   *  Surfaced separately so the client can show "你的成绩:" even
   *  when the user isn't in top-20. */
  myResult?: DailyChallengeParticipant;
}

export function getDailyChallengeSummary(opts?: { userId?: string }): DailyChallengeSummary {
  const date = todayUTC();
  const day = getOrCreateDay(date);
  const ranked = [...day.participants.values()].sort(
    (a, b) => ratio(b) - ratio(a)
      || a.ts - b.ts, // tie-break by earliest completion (faster wins)
  );
  const topResults = ranked.slice(0, 20);
  const myResult = opts?.userId
    ? day.participants.get(opts.userId)
    : undefined;
  return {
    date: day.date,
    scenarioId: day.scenarioId,
    scenarioTitle: day.scenarioTitle,
    scenarioEmoji: day.scenarioEmoji,
    participantCount: day.participants.size,
    topResults,
    myResult,
  };
}

function ratio(p: DailyChallengeParticipant): number {
  return p.maxPossible > 0 ? p.compensationMonths / p.maxPossible : 0;
}

/** Record (or improve) a user's result for today's challenge. Returns
 *  the resulting summary so the client gets fresh leaderboard data
 *  in the same round-trip.
 *
 *  Best-of-day dedup: if a user replays with a worse result, the
 *  prior best stays (most users will REPLAY to climb, not regress).
 *  This is a design call — if you'd rather "latest wins" (so users
 *  can intentionally bow out), flip the comparison.
 */
export function recordDailyChallengeResult(opts: {
  userId: string;
  displayName?: string;
  archetype?: Pick<Archetype, 'id' | 'name' | 'emoji'> | null;
  scenarioId: string;
  compensationMonths: number;
  maxPossible: number;
  grade: Grade;
  tactic?: string;
}): { recorded: boolean; reason?: string; summary: DailyChallengeSummary } {
  const date = todayUTC();
  const day = getOrCreateDay(date);

  // Only record if the played scenario matches today's daily challenge.
  // Otherwise the entry would be misleading ("today's challenge is X
  // but you played Y"). Caller should preflight, but defensive here.
  if (opts.scenarioId !== day.scenarioId) {
    return {
      recorded: false,
      reason: 'scenario mismatch — not today\'s daily challenge',
      summary: getDailyChallengeSummary({ userId: opts.userId }),
    };
  }

  const entry: DailyChallengeParticipant = {
    userId: opts.userId,
    displayName: opts.displayName?.trim() || '员工',
    archetypeId:    opts.archetype?.id,
    archetypeName:  opts.archetype?.name,
    archetypeEmoji: opts.archetype?.emoji,
    compensationMonths: opts.compensationMonths,
    maxPossible: opts.maxPossible,
    grade: opts.grade,
    tactic: opts.tactic,
    ts: Date.now(),
  };

  const prev = day.participants.get(opts.userId);
  if (prev && ratio(prev) >= ratio(entry)) {
    // User regressed or tied — keep the prior best.
    return {
      recorded: false,
      reason: 'no improvement over your prior best for today',
      summary: getDailyChallengeSummary({ userId: opts.userId }),
    };
  }
  day.participants.set(opts.userId, entry);
  return {
    recorded: true,
    summary: getDailyChallengeSummary({ userId: opts.userId }),
  };
}
