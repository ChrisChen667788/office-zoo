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
import { listUserSquadHistory } from '../services/squadHistoryStore';

export const squadRoutes = new Hono();

squadRoutes.get('/history/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ history: [] });
  const history = await listUserSquadHistory(userId);
  return c.json({ history });
});
