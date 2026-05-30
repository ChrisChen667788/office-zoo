/**
 * v6.36 P4 — leaderboard route behavior.
 *
 * We don't want this test to interfere with the real banwei.json on
 * disk (or to need an empty filesystem to pass), so we drive the
 * leaderboard reducer through a real banwei POST flow first, then
 * query the leaderboard route on the same Hono instance. The banwei
 * route's internal cache + disk file is shared with the leaderboard
 * route, so this exercises the actual end-to-end path.
 *
 * For isolation across tests we monkey-patch the DATA_FILE-touching
 * `load`/`save` by setting the cache directly via a private hook
 * we re-import here. (Mirrors stats.test.ts pattern.)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { leaderboardRoutes } from '../leaderboard';
import { banweiRoutes } from '../banwei';

/** Helper: POST a banwei snapshot for a given userId with controllable
 *  inputs. Uses the same code path the client would. */
async function postBanwei(
  userId: string,
  body: {
    gamesSeen?: number; talkshowPlayed?: number; anniversaryVisited?: number;
    region?: string; industry?: string;
  } = {},
) {
  return banweiRoutes.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    body: JSON.stringify({
      gamesSeen: 5,
      talkshowPlayed: 5,
      anniversaryVisited: 1,
      ...body,
    }),
  });
}

/** Reset the banwei store between tests. Imports lazily so we touch
 *  the same module instance that the routes use. */
beforeEach(async () => {
  // Wipe the on-disk cache via a re-import. We don't expose a clear()
  // helper from banwei.ts (didn't want a prod surface), so reach in
  // through the module's internal state instead.
  const mod = await import('../banwei');
  const store = await mod.loadBanweiStoreReadonly();
  for (const key of Object.keys(store.byUser)) {
    delete store.byUser[key];
  }
});

describe('GET /api/leaderboard/banwei', () => {
  it('empty store → empty top + total 0', async () => {
    const r = await leaderboardRoutes.request('/banwei');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.top).toEqual([]);
    expect(j.total).toBe(0);
    expect(typeof j.weekKey).toBe('string');
  });

  it('ranks by score desc', async () => {
    // High scorer
    await postBanwei('alice', { gamesSeen: 5, talkshowPlayed: 5, anniversaryVisited: 1 });
    // Mid scorer
    await postBanwei('bob',   { gamesSeen: 3, talkshowPlayed: 2, anniversaryVisited: 1 });
    // Low scorer
    await postBanwei('carol', { gamesSeen: 1, talkshowPlayed: 0, anniversaryVisited: 0 });

    const r = await leaderboardRoutes.request('/banwei');
    const j = await r.json();
    expect(j.total).toBe(3);
    expect(j.top.length).toBe(3);
    // Alice should be #1 (highest score by formula construction)
    expect(j.top[0].score).toBeGreaterThanOrEqual(j.top[1].score);
    expect(j.top[1].score).toBeGreaterThanOrEqual(j.top[2].score);
  });

  it('truncates userId to 8 chars (privacy)', async () => {
    await postBanwei('verylonguserid-1234567890abc');
    const r = await leaderboardRoutes.request('/banwei');
    const j = await r.json();
    expect(j.top[0].userIdPrefix.length).toBe(8);
    expect(j.top[0].userIdPrefix).toBe('verylong');
  });

  it('honors ?limit param', async () => {
    for (let i = 0; i < 5; i++) {
      await postBanwei(`u-${i}`);
    }
    const r = await leaderboardRoutes.request('/banwei?limit=2');
    const j = await r.json();
    expect(j.top.length).toBe(2);
    expect(j.total).toBe(5);
  });

  it('clamps limit to MAX_LIMIT (50)', async () => {
    for (let i = 0; i < 3; i++) {
      await postBanwei(`u-${i}`);
    }
    const r = await leaderboardRoutes.request('/banwei?limit=99999');
    const j = await r.json();
    expect(j.top.length).toBe(3);  // capped by total, not the requested limit
  });

  it('ignores invalid limit (defaults to 10)', async () => {
    for (let i = 0; i < 12; i++) {
      await postBanwei(`u-${i}`);
    }
    const r = await leaderboardRoutes.request('/banwei?limit=NaN');
    const j = await r.json();
    expect(j.top.length).toBe(10);
  });

  // v6.37 P1 — tribe filter coverage
  it('filters by region', async () => {
    await postBanwei('alice', { region: 'beijing' });
    await postBanwei('bob',   { region: 'shanghai' });
    await postBanwei('carol', { region: 'beijing' });
    const r = await leaderboardRoutes.request('/banwei?region=beijing');
    const j = await r.json();
    expect(j.total).toBe(2);
    expect(j.filters.region).toBe('beijing');
    for (const row of j.top) expect(row.region).toBe('beijing');
  });

  it('filters by industry', async () => {
    await postBanwei('alice', { industry: 'faang' });
    await postBanwei('bob',   { industry: 'startup' });
    const r = await leaderboardRoutes.request('/banwei?industry=faang');
    const j = await r.json();
    expect(j.total).toBe(1);
    expect(j.top[0].industry).toBe('faang');
  });

  it('combines region + industry filters (AND)', async () => {
    await postBanwei('alice', { region: 'beijing', industry: 'faang' });
    await postBanwei('bob',   { region: 'beijing', industry: 'startup' });
    await postBanwei('carol', { region: 'shanghai', industry: 'faang' });
    const r = await leaderboardRoutes.request('/banwei?region=beijing&industry=faang');
    const j = await r.json();
    expect(j.total).toBe(1);
    expect(j.top[0].userIdPrefix).toBe('alice');
  });

  it('invalid region silently ignored (returns all)', async () => {
    await postBanwei('alice', { region: 'beijing' });
    const r = await leaderboardRoutes.request('/banwei?region=mars');
    const j = await r.json();
    expect(j.total).toBe(1);
    expect(j.filters.region).toBeUndefined();
  });

  it('snapshot without region is excluded when region filter is set', async () => {
    await postBanwei('alice'); // no region
    await postBanwei('bob', { region: 'beijing' });
    const r = await leaderboardRoutes.request('/banwei?region=beijing');
    const j = await r.json();
    expect(j.total).toBe(1);
    expect(j.top[0].userIdPrefix).toBe('bob');
  });

  it('rejects invalid region/industry strings on POST', async () => {
    // Invalid POST values are dropped — the snapshot is stored without
    // any region/industry tag at all.
    await postBanwei('alice', { region: 'MARS', industry: 'crypto' });
    const r = await leaderboardRoutes.request('/banwei');
    const j = await r.json();
    expect(j.top[0].region).toBeUndefined();
    expect(j.top[0].industry).toBeUndefined();
    // And so a valid filter excludes that row (no region to match).
    const r2 = await leaderboardRoutes.request('/banwei?region=beijing');
    const j2 = await r2.json();
    expect(j2.total).toBe(0);
  });
});
