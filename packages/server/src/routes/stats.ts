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
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// v6.33 P5 — disk snapshot. Counters are still hot-path (every bump
// mutates Maps in-memory), but we periodically + on-shutdown persist
// to stats.json so server restart doesn't reset spectator metrics.
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'stats.json');
const FLUSH_INTERVAL_MS = 60_000;
let dirtySinceLastFlush = false;
let flushTimer: NodeJS.Timeout | null = null;

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

/* ── Persistence (v6.33 P5) ─────────────────────────────────────── */

interface Persisted {
  totalGames: number;
  totalPlayersSpawned: number;
  totalSpeeches: number;
  totalLeaks: number;
  totalLeakQuotes: number;
  ratAppearances: Array<[string, number]>;
  perUserLeaks: Array<[string, number]>;
  perUserLeakQuotes: Array<[string, number]>;
}

export async function loadCountersFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const p = JSON.parse(raw) as Partial<Persisted>;
    counters.totalGames = p.totalGames ?? 0;
    counters.totalPlayersSpawned = p.totalPlayersSpawned ?? 0;
    counters.totalSpeeches = p.totalSpeeches ?? 0;
    counters.totalLeaks = p.totalLeaks ?? 0;
    counters.totalLeakQuotes = p.totalLeakQuotes ?? 0;
    counters.ratAppearances = new Map(p.ratAppearances ?? []);
    counters.perUserLeaks = new Map(p.perUserLeaks ?? []);
    counters.perUserLeakQuotes = new Map(p.perUserLeakQuotes ?? []);
    // activeGames NOT restored — restart drops live game state, so
    // any "active" claim from the prior process would be a lie.
    counters.activeGames = 0;
  } catch {
    // ENOENT on first boot — silent. Counters stay at module init.
  }
}

async function flushToDisk(): Promise<void> {
  if (!dirtySinceLastFlush) return;
  const payload: Persisted = {
    totalGames: counters.totalGames,
    totalPlayersSpawned: counters.totalPlayersSpawned,
    totalSpeeches: counters.totalSpeeches,
    totalLeaks: counters.totalLeaks,
    totalLeakQuotes: counters.totalLeakQuotes,
    ratAppearances: [...counters.ratAppearances.entries()],
    perUserLeaks: [...counters.perUserLeaks.entries()],
    perUserLeakQuotes: [...counters.perUserLeakQuotes.entries()],
  };
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmp, DATA_FILE);
    dirtySinceLastFlush = false;
  } catch { /* disk write failed — counters still in memory */ }
}

/** Idempotent — call once on server boot. Loads counters + arms a
 *  periodic flush timer. SIGINT/SIGTERM handlers also flush on exit. */
export function initStatsPersistence(): void {
  if (flushTimer) return;
  void loadCountersFromDisk();
  flushTimer = setInterval(() => void flushToDisk(), FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
  // Best-effort on graceful shutdown — synchronous is impossible with
  // fs.promises so we do an async flush and hope the event loop gets
  // a tick. Most platforms give us ~1s before SIGKILL.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => { void flushToDisk(); });
  }
}

function markDirty(): void { dirtySinceLastFlush = true; }

/* ── Public mutators (call from engine / socket) ────────────────── */

export function bumpGameCreated(playerNames: string[]): void {
  counters.totalGames += 1;
  counters.activeGames += 1;
  counters.totalPlayersSpawned += playerNames.length;
  for (const name of playerNames) {
    counters.ratAppearances.set(name, (counters.ratAppearances.get(name) ?? 0) + 1);
  }
  markDirty();
}

export function bumpGameOver(): void {
  counters.activeGames = Math.max(0, counters.activeGames - 1);
  markDirty();
}

export function bumpSpeech(): void { counters.totalSpeeches += 1; markDirty(); }

export function bumpLeak(userId?: string): void {
  counters.totalLeaks += 1;
  if (userId) {
    counters.perUserLeaks.set(userId, (counters.perUserLeaks.get(userId) ?? 0) + 1);
  }
  markDirty();
}

export function bumpLeakQuote(userId?: string): void {
  counters.totalLeakQuotes += 1;
  if (userId) {
    counters.perUserLeakQuotes.set(userId, (counters.perUserLeakQuotes.get(userId) ?? 0) + 1);
  }
  markDirty();
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
