/**
 * v6.32 P4 — /api/stats/overview behavior.
 *
 * Verifies global counters bump correctly + per-user X-User-Id scoping
 * doesn't bleed across users + hitRate math.
 *
 * Direct call into the bump fns + Hono test request — no socket layer
 * exercised (that's covered by integration in v6.31 P5 wire-up).
 *
 * NB: the stats module holds singleton counters at module scope, so
 * test order matters. We use a `clearCountersForTest()` helper added
 * specifically for vitest. Production code never calls it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  statsRoutes, bumpGameCreated, bumpGameOver, bumpSpeech,
  bumpLeak, bumpLeakQuote, clearCountersForTest,
} from '../stats';

beforeEach(() => clearCountersForTest());

async function fetchOverview(userId?: string) {
  const headers: Record<string, string> = {};
  if (userId) headers['X-User-Id'] = userId;
  const res = await statsRoutes.request('/overview', { headers });
  return res.json();
}

describe('stats — global counters', () => {
  it('starts at zero', async () => {
    const j = await fetchOverview();
    expect(j.global.totalGames).toBe(0);
    expect(j.global.totalLeaks).toBe(0);
    expect(j.global.totalLeakQuotes).toBe(0);
    expect(j.global.topRats).toEqual([]);
  });

  it('bumpGameCreated bumps totalGames + activeGames + spawns + rat appearances', async () => {
    bumpGameCreated(['Tony', 'Helen', 'Mike']);
    bumpGameCreated(['Tony', 'Lisa']);
    const j = await fetchOverview();
    expect(j.global.totalGames).toBe(2);
    expect(j.global.activeGames).toBe(2);
    expect(j.global.totalPlayersSpawned).toBe(5);
    // Tony appears twice; tops the leaderboard.
    expect(j.global.topRats[0]).toEqual({ name: 'Tony', count: 2 });
  });

  it('bumpGameOver decrements activeGames (clamped ≥ 0)', async () => {
    bumpGameCreated(['Tony']);
    bumpGameOver();
    const j = await fetchOverview();
    expect(j.global.activeGames).toBe(0);
    // Extra bumpGameOver shouldn't drop below zero
    bumpGameOver();
    const j2 = await fetchOverview();
    expect(j2.global.activeGames).toBe(0);
  });

  it('bumpSpeech / bumpLeak / bumpLeakQuote independent', async () => {
    bumpSpeech();
    bumpSpeech();
    bumpLeak();
    bumpLeakQuote();
    bumpLeakQuote();
    const j = await fetchOverview();
    expect(j.global.totalSpeeches).toBe(2);
    expect(j.global.totalLeaks).toBe(1);
    expect(j.global.totalLeakQuotes).toBe(2);
  });

  it('global hitRate = quotes / leaks', async () => {
    bumpLeak();
    bumpLeak();
    bumpLeak();
    bumpLeakQuote();
    const j = await fetchOverview();
    expect(j.global.hitRate).toBeCloseTo(1 / 3, 5);
  });

  it('Top 5 rats truncates + sorted desc', async () => {
    bumpGameCreated(['A', 'A', 'A', 'B', 'B', 'C', 'D', 'E', 'F']);
    const j = await fetchOverview();
    expect(j.global.topRats).toHaveLength(5);
    expect(j.global.topRats[0]).toEqual({ name: 'A', count: 3 });
    expect(j.global.topRats[1]).toEqual({ name: 'B', count: 2 });
  });
});

describe('stats — per-user X-User-Id scoping', () => {
  it('no X-User-Id header → user block is null', async () => {
    bumpLeak('user-1');
    const j = await fetchOverview();
    expect(j.user).toBeNull();
  });

  it('X-User-Id present → user block has that user\'s tallies', async () => {
    bumpLeak('user-1');
    bumpLeak('user-1');
    bumpLeakQuote('user-1');
    const j = await fetchOverview('user-1');
    expect(j.user.leaks).toBe(2);
    expect(j.user.leakQuotes).toBe(1);
    expect(j.user.hitRate).toBeCloseTo(0.5, 5);
  });

  it('different users are isolated (no cross-bleed)', async () => {
    bumpLeak('alice');
    bumpLeak('alice');
    bumpLeakQuote('alice');
    bumpLeak('bob');
    bumpLeakQuote('bob');
    bumpLeakQuote('bob');
    const a = await fetchOverview('alice');
    const b = await fetchOverview('bob');
    expect(a.user).toEqual({ leaks: 2, leakQuotes: 1, hitRate: 0.5 });
    expect(b.user.leaks).toBe(1);
    expect(b.user.leakQuotes).toBe(2);
    // bob's hit rate (2/1 = 2.0) — degenerate but math passes
    expect(b.user.hitRate).toBe(2);
  });

  it('anonymous leaks (no userId) DON\'T attribute to any user', async () => {
    bumpLeak(); // no userId
    bumpLeak('alice');
    const j = await fetchOverview('alice');
    expect(j.user.leaks).toBe(1); // only the attributed one
    // Global counter sees both
    const all = await fetchOverview();
    expect(all.global.totalLeaks).toBe(2);
  });

  it('unknown user gets zero tallies', async () => {
    bumpLeak('alice');
    const j = await fetchOverview('stranger');
    expect(j.user.leaks).toBe(0);
    expect(j.user.leakQuotes).toBe(0);
    expect(j.user.hitRate).toBe(0);
  });
});

// v6.33 P5 — disk persistence behavior
describe('stats — disk persistence', () => {
  it('loadCountersFromDisk restores prior tallies', async () => {
    const { loadCountersFromDisk } = await import('../stats');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    // Write a synthetic snapshot. Path matches module's DATA_FILE.
    const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
    const DATA_FILE = path.join(DATA_DIR, 'stats.json');
    await fs.mkdir(DATA_DIR, { recursive: true });
    const original = await fs.readFile(DATA_FILE, 'utf8').catch(() => null);
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify({
        totalGames: 42,
        totalPlayersSpawned: 200,
        totalSpeeches: 999,
        totalLeaks: 7,
        totalLeakQuotes: 3,
        ratAppearances: [['Tony', 11], ['Helen', 5]],
        perUserLeaks: [['alice', 4]],
        perUserLeakQuotes: [['alice', 2]],
      }), 'utf8');
      clearCountersForTest();
      await loadCountersFromDisk();
      const j = await fetchOverview('alice');
      expect(j.global.totalGames).toBe(42);
      expect(j.global.totalLeaks).toBe(7);
      expect(j.global.totalLeakQuotes).toBe(3);
      expect(j.global.activeGames).toBe(0); // not restored — see comment in source
      expect(j.global.topRats[0]).toEqual({ name: 'Tony', count: 11 });
      expect(j.user.leaks).toBe(4);
      expect(j.user.leakQuotes).toBe(2);
      expect(j.user.hitRate).toBe(0.5);
    } finally {
      // Restore prior file (or delete if it didn't exist before)
      if (original === null) await fs.unlink(DATA_FILE).catch(() => {});
      else await fs.writeFile(DATA_FILE, original, 'utf8');
      clearCountersForTest();
    }
  });
});
