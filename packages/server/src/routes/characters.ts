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
import {
  getCharacterStats,
  getAllCharacterStats,
} from '../services/characterStatsStore';
import {
  getTopForUser,
  getUserViews,
} from '../services/userCharacterViewsStore';

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
