/**
 * /api/squad — v1.4.3 squad HTTP routes.
 *
 * Sibling to the socket handler (squadHandler.ts) which owns the
 * realtime room lifecycle. This module covers the read-side queries
 * that don't need a live socket: history listing, future group stats.
 *
 *   GET /history/me — this user's past squad attendances (newest first)
 */

import { Hono } from 'hono';
import { listUserSquadHistory, getSquadStatsFor } from '../services/squadHistoryStore';

export const squadRoutes = new Hono();

squadRoutes.get('/history/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ history: [] });
  const history = await listUserSquadHistory(userId);
  return c.json({ history });
});

/**
 * v6.11 P3 — aggregate squad attendance for a userId. Public-ish (no
 * recap leakage, only counts + co-member display names), so SquadMemberCard
 * can show "参加过 N 局攒局 / 最近 7 天 X 次" without auth dance.
 */
squadRoutes.get('/stats/of/:userId', async (c) => {
  const userId = c.req.param('userId').slice(0, 64);
  if (!userId) return c.json({ stats: null }, 400);
  const stats = await getSquadStatsFor(userId);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ stats });
});

/** v6.15 P2 — alias for current user's own stats (reads X-User-Id).
 *  Avoids the client constructing self-URLs with its own userId. */
squadRoutes.get('/stats/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ stats: null });
  const stats = await getSquadStatsFor(userId);
  c.header('Cache-Control', 'no-store'); // per-user, don't share
  return c.json({ stats });
});
