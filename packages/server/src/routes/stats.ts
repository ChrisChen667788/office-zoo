/**
 * /api/stats — v6.31 P5 spectator stats aggregation.
 *
 * GET /api/stats/overview
 *   Server-side aggregates that don't need client-side localStorage:
 *     • totalGames                  — distinct game ids created since boot
 *     • activeGames                 — currently-running games
 *     • totalPlayersSpawned         — sum of player rosters
 *     • totalSpeeches               — discussion speeches generated
 *     • totalLeaks                  — server has SEEN this many psy-war
 *                                    submissions (post rate-limit)
 *     • totalLeakQuotes             — game:leak_quoted emit count
 *     • topRats                     — Top 5 rat names by appearance count
 *
 *   Counts live in module-level mutable state — bumped from socket /
 *   engine event handlers (see below). Reset to 0 on server restart;
 *   no DB to keep the route LLM-free + cheap. Future v7 could promote
 *   to pgvector + cron snapshot.
 *
 *   X-User-Id (optional): when present, the response also includes a
 *   `user` block aggregating this user's contributions via the same
 *   counters keyed by user id.
 */
import { Hono } from 'hono';

// ── In-memory counters (server-lifetime) ───────────────────────────
interface Counters {
  totalGames: number;
  activeGames: number;
  totalPlayersSpawned: number;
  totalSpeeches: number;
  totalLeaks: number;
  totalLeakQuotes: number;
  ratAppearances: Map<string, number>;
  perUserLeaks: Map<string, number>;
  perUserLeakQuotes: Map<string, number>;
}

const counters: Counters = {
  totalGames: 0,
  activeGames: 0,
  totalPlayersSpawned: 0,
  totalSpeeches: 0,
  totalLeaks: 0,
  totalLeakQuotes: 0,
  ratAppearances: new Map(),
  perUserLeaks: new Map(),
  perUserLeakQuotes: new Map(),
};

/* ── Public mutators (call from engine / socket) ────────────────── */

export function bumpGameCreated(playerNames: string[]): void {
  counters.totalGames += 1;
  counters.activeGames += 1;
  counters.totalPlayersSpawned += playerNames.length;
  for (const name of playerNames) {
    counters.ratAppearances.set(name, (counters.ratAppearances.get(name) ?? 0) + 1);
  }
}

export function bumpGameOver(): void {
  counters.activeGames = Math.max(0, counters.activeGames - 1);
}

export function bumpSpeech(): void { counters.totalSpeeches += 1; }

export function bumpLeak(userId?: string): void {
  counters.totalLeaks += 1;
  if (userId) {
    counters.perUserLeaks.set(userId, (counters.perUserLeaks.get(userId) ?? 0) + 1);
  }
}

export function bumpLeakQuote(userId?: string): void {
  counters.totalLeakQuotes += 1;
  if (userId) {
    counters.perUserLeakQuotes.set(userId, (counters.perUserLeakQuotes.get(userId) ?? 0) + 1);
  }
}

/** v6.32 P5 — read accessors for cross-route consumers (banwei).
 *  Keep counters Map opaque so callers can't mutate it directly. */
export function getPerUserLeaks(userId: string): number {
  return counters.perUserLeaks.get(userId) ?? 0;
}
export function getPerUserLeakQuotes(userId: string): number {
  return counters.perUserLeakQuotes.get(userId) ?? 0;
}

/** v6.32 P4 — test-only reset. Vitest fixtures call this in beforeEach
 *  so test order doesn't matter. Production code never calls it. */
export function clearCountersForTest(): void {
  counters.totalGames = 0;
  counters.activeGames = 0;
  counters.totalPlayersSpawned = 0;
  counters.totalSpeeches = 0;
  counters.totalLeaks = 0;
  counters.totalLeakQuotes = 0;
  counters.ratAppearances.clear();
  counters.perUserLeaks.clear();
  counters.perUserLeakQuotes.clear();
}

/* ── Route ──────────────────────────────────────────────────────── */

export const statsRoutes = new Hono();

statsRoutes.get('/overview', (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64) || null;

  // Top 5 rats by appearance count
  const topRats = [...counters.ratAppearances.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const userBlock = userId ? {
    leaks: counters.perUserLeaks.get(userId) ?? 0,
    leakQuotes: counters.perUserLeakQuotes.get(userId) ?? 0,
    hitRate: (() => {
      const l = counters.perUserLeaks.get(userId) ?? 0;
      const q = counters.perUserLeakQuotes.get(userId) ?? 0;
      return l > 0 ? q / l : 0;
    })(),
  } : null;

  return c.json({
    global: {
      totalGames: counters.totalGames,
      activeGames: counters.activeGames,
      totalPlayersSpawned: counters.totalPlayersSpawned,
      totalSpeeches: counters.totalSpeeches,
      totalLeaks: counters.totalLeaks,
      totalLeakQuotes: counters.totalLeakQuotes,
      hitRate: counters.totalLeaks > 0 ? counters.totalLeakQuotes / counters.totalLeaks : 0,
      topRats,
    },
    user: userBlock,
    serverUptimeSec: Math.floor(process.uptime()),
  });
});
