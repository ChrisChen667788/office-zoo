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

export const characterRoutes = new Hono();

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
