/**
 * /api/characters — v6.8 character IP HTTP routes.
 *
 *   GET /:name        — full PersonaCard payload (static + lifetime stats)
 *   GET /             — all characters with stats (PersonaGallery use case)
 *
 * Static fields come from packages/shared/src/data/characters.ts
 * (CHARACTERS roster). Lifetime stats come from characterStatsStore
 * (per-name JSON-file persistence, updated at every GAME_OVER + every
 * vote cast during runVoting).
 *
 * Cache strategy: 60s cache headers because stats only change once per
 * game (and even then the user wouldn't notice a 60s lag). Keeps the
 * PersonaCard's first-open fetch snappy when the user opens the same
 * character's card multiple times in one session.
 */

import { Hono } from 'hono';
import { findCharacter, CHARACTERS, ALL_CHARACTER_NAMES } from '@furball/shared';

/* v6.14 P1 — deterministic daily featured character. The same character
 * surfaces for ALL users on the same calendar date, which makes it a
 * shared social conversation hook ("今天的主角是 Tony, 加油") rather than
 * personalized noise. djb2 string hash → index into ALL_CHARACTER_NAMES.
 *
 * Why YYYY-MM-DD in server-local TZ rather than UTC: midnight rollover
 * lines up with what users perceive as "today". For a multi-region
 * deploy the surrogate is good enough — we don't need per-region rotation. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pickDailyCharacter(date = todayYMD()): { name: string; date: string } {
  const idx = djb2(date) % ALL_CHARACTER_NAMES.length;
  return { name: ALL_CHARACTER_NAMES[idx], date };
}
import {
  getCharacterStats,
  getAllCharacterStats,
} from '../services/characterStatsStore';
import {
  getTopForUser,
  getUserViews,
  getUserTrend,
} from '../services/userCharacterViewsStore';
import { getCharacterOgCard } from '../services/ogCardRenderer';
import {
  createDuel,
  joinDuel,
  getDuel,
  scoreDuel,
  getDuelLeaders,
  listUserDuels,
  BALLOT_SIZE,
} from '../services/voteDuelStore';
import {
  castVote,
  getCharacterVotes,
  getUserBallot,
  getWeeklyLeaders,
  getCharacterHistory,
  getCharacterHistoryAll,
  getWeeklyAll,
} from '../services/characterVoteStore';
import { ALL_PERSONALITIES } from '@furball/shared';

export const characterRoutes = new Hono();

/**
 * v6.10 — personalized "你看过的 Top N" for the current user.
 * Requires X-User-Id header (consistent with /api/squad/history/me).
 * Returns up to N rats sorted by views desc, fully hydrated with
 * static CharacterCard payload. Empty array = user hasn't watched
 * any games yet; client falls back to the global TopRatsPanel.
 */
characterRoutes.get('/me/top', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  const n = Math.max(1, Math.min(10, parseInt(c.req.query('n') ?? '3', 10) || 3));
  if (!userId) return c.json({ top: [] });
  const top = await getTopForUser(userId, n);
  const hydrated = top
    .map((t) => {
      const character = CHARACTERS[t.name];
      if (!character) return null;
      return {
        ...character,
        watched: {
          views: t.views,
          winsWatched: t.winsWatched,
          lossesWatched: t.lossesWatched,
          lastAt: t.lastAt,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  // Don't cache per-user routes; they change as the user plays.
  c.header('Cache-Control', 'no-store');
  return c.json({ top: hydrated });
});

/** Full user ledger — for the "我看过的全部鼠人" detail page, future. */
characterRoutes.get('/me/views', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ views: {} });
  const views = await getUserViews(userId);
  c.header('Cache-Control', 'no-store');
  return c.json({ views });
});

/**
 * v6.11 — personality trend summary over the last N days (default 30).
 * Powers TopRatsPanel's trend chip "近 30 天你最爱看 X". `rawEvents` is
 * intended for a v6.12 SVG trend line; current panel only needs
 * dominantPersonality + counts.
 */
/**
 * v6.12 P2 — per-character OG PNG. Server-side Playwright pre-render
 * (1200×630), cached to packages/server/data/og-cards/<name>-<lastGameId>.png.
 * Cache auto-invalidates when stats lastGameId changes. Used as og:image
 * by /share/character/:name HTML, upgrading from the v6.11 shared logo.
 *
 * Cache headers: public, max-age 1 hour. Crawlers cache aggressively;
 * stats change → URL filename suffix changes → fresh fetch.
 */
characterRoutes.get('/:name/og-card.png', async (c) => {
  const name = c.req.param('name');
  const buf = await getCharacterOgCard(name);
  if (!buf) return c.json({ error: 'unknown character' }, 404);
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', 'public, max-age=3600');
  // v6.25 P4 — Buffer is a Uint8Array subclass; Hono's c.body overload
  // signature only lists Uint8Array, so we widen explicitly.
  return c.body(new Uint8Array(buf));
});

/**
 * v6.16 P1 — character personality vote endpoints.
 *
 *   POST /:name/vote     — cast / overwrite this week's ballot for :name
 *   GET  /:name/votes    — public tally + dominant for :name (current week)
 *   GET  /votes/me       — user's full weekly ballot (Record<name, personality>)
 *   GET  /votes/leaders  — 12-rat winning personality this week
 */
characterRoutes.post('/:name/vote', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ error: '需要 X-User-Id header' }, 400);
  }
  const name = c.req.param('name');
  if (!findCharacter(name)) return c.json({ error: 'unknown character' }, 404);
  let body: unknown;
  try { body = await c.req.json(); } catch { body = null; }
  const personality = (body as { personality?: string } | null)?.personality;
  if (!personality || typeof personality !== 'string' || !ALL_PERSONALITIES.includes(personality as never)) {
    return c.json({ error: 'invalid personality (must be one of ALL_PERSONALITIES)' }, 400);
  }
  const result = await castVote(userId, name, personality);
  if (!result.ok) return c.json({ error: result.reason }, 500);
  const tally = await getCharacterVotes(name);
  return c.json({
    ok: true,
    previousPersonality: result.previousPersonality,
    tally: tally.tally,
    dominant: tally.dominant,
    weekKey: tally.weekKey,
  });
});

characterRoutes.get('/:name/votes', async (c) => {
  const name = c.req.param('name');
  if (!findCharacter(name)) return c.json({ error: 'unknown character' }, 404);
  const data = await getCharacterVotes(name);
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(data);
});

/**
 * v6.17 P2 — last N weeks of winning personality for one character.
 * Powers CharacterVoteModal's history strip + Profile cross-tab.
 */
characterRoutes.get('/:name/votes/history', async (c) => {
  const name = c.req.param('name');
  if (!findCharacter(name)) return c.json({ error: 'unknown character' }, 404);
  const weeks = Math.max(1, Math.min(12, parseInt(c.req.query('weeks') ?? '4', 10) || 4));
  const history = await getCharacterHistory(name, weeks);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ history });
});

characterRoutes.get('/votes/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ ballot: {}, weekKey: '' });
  const data = await getUserBallot(userId);
  c.header('Cache-Control', 'no-store');
  return c.json(data);
});

characterRoutes.get('/votes/leaders', async (c) => {
  const data = await getWeeklyLeaders();
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(data);
});

/**
 * v6.17 P1 — current week full tally for all rats. Powers /character-votes
 * leaderboard page. Sorted by totalVotes desc so high-engagement rats
 * surface first. Lazy: only includes rats with ≥ 1 vote this week
 * (caller can render "no votes yet" for the rest).
 */
characterRoutes.get('/votes/all', async (c) => {
  const data = await getWeeklyAll();
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(data);
});

/**
 * v6.18 P1 — last N weeks of weekly winner for every character.
 * Powers /character-votes "过去 N 周霸榜" timeline matrix.
 */
characterRoutes.get('/votes/history-all', async (c) => {
  const weeks = Math.max(1, Math.min(12, parseInt(c.req.query('weeks') ?? '4', 10) || 4));
  const data = await getCharacterHistoryAll(weeks);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(data);
});

/* ─── v6.18 P3 — 1v1 vote duel ─────────────────────────────────────── */
characterRoutes.post('/votes/duels', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) return c.json({ error: '需要 X-User-Id header' }, 400);
  let body: unknown;
  try { body = await c.req.json(); } catch { body = null; }
  const ballot = (body as { ballot?: unknown } | null)?.ballot;
  const r = await createDuel(userId, ballot);
  if (!r.ok) return c.json({ error: r.reason }, 400);
  return c.json({
    duelId: r.duel.duelId,
    shareUrl: `/duel/${r.duel.duelId}`,
    ballotSize: BALLOT_SIZE,
  });
});

/**
 * v6.19 P2 — 斗投 MVP leaderboard. Top users by wins this week
 * (across all duels). Computed live from voteDuelStore + current
 * /votes/leaders. 30s cache.
 *
 * Route order matters: registered BEFORE /votes/duels/:id so Hono
 * doesn't match `/leaders` as `:id`.
 */
characterRoutes.get('/votes/duels/leaders', async (c) => {
  const n = Math.max(1, Math.min(30, parseInt(c.req.query('n') ?? '10', 10) || 10));
  const data = await getDuelLeaders(undefined, n);
  c.header('Cache-Control', 'public, max-age=30');
  return c.json(data);
});

/**
 * v6.20 P3 — current user's own duels (host OR guest), newest first.
 * Powers Profile's MyDuelsPanel. Always registered BEFORE
 * /votes/duels/:id (else Hono matches "me" as :id).
 */
characterRoutes.get('/votes/duels/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ duels: [] });
  const limit = Math.max(1, Math.min(50, parseInt(c.req.query('limit') ?? '20', 10) || 20));
  const duels = await listUserDuels(userId, limit);
  c.header('Cache-Control', 'no-store');
  return c.json({ duels });
});

characterRoutes.get('/votes/duels/:id', async (c) => {
  const id = c.req.param('id');
  const duel = await getDuel(id);
  if (!duel) return c.json({ error: 'duel not found' }, 404);
  const scores = await scoreDuel(duel);
  c.header('Cache-Control', 'no-store');
  return c.json({ duel, scores });
});

characterRoutes.post('/votes/duels/:id/join', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) return c.json({ error: '需要 X-User-Id header' }, 400);
  let body: unknown;
  try { body = await c.req.json(); } catch { body = null; }
  const ballot = (body as { ballot?: unknown } | null)?.ballot;
  const r = await joinDuel(c.req.param('id'), userId, ballot);
  if (!r.ok) return c.json({ error: r.reason }, 400);
  const scores = await scoreDuel(r.duel);
  return c.json({ duel: r.duel, scores });
});

characterRoutes.get('/me/trend', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  const days = Math.max(1, Math.min(90, parseInt(c.req.query('days') ?? '30', 10) || 30));
  if (!userId) return c.json({ trend: null });
  const trend = await getUserTrend(userId, days);
  c.header('Cache-Control', 'no-store');
  return c.json({ trend });
});

/**
 * v6.14 P1 — today's featured rat. Deterministic per server-local date
 * via djb2 hash → 12-roster index. All users get the same character on
 * the same day, which is the point (shared social conversation hook).
 * Includes optional ?date=YYYY-MM-DD override for previews / scheduling.
 *
 * Cache: 60s public — even though it's stable for the whole day, a
 * short TTL means the rollover at local midnight is picked up within a
 * minute of the new day starting.
 */
characterRoutes.get('/daily', async (c) => {
  const dateOverride = c.req.query('date');
  const pick = dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
    ? pickDailyCharacter(dateOverride)
    : pickDailyCharacter();
  const character = CHARACTERS[pick.name];
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    date: pick.date,
    character,
  });
});

characterRoutes.get('/', async (c) => {
  const allStats = await getAllCharacterStats();
  const payload = ALL_CHARACTER_NAMES.map((name) => ({
    ...CHARACTERS[name],
    stats: allStats[name] ?? null,
  }));
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ characters: payload });
});

characterRoutes.get('/:name', async (c) => {
  const name = c.req.param('name');
  const character = findCharacter(name);
  if (!character) {
    return c.json({ error: 'unknown character' }, 404);
  }
  const stats = await getCharacterStats(name);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ character, stats });
});
