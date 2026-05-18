/**
 * /api/daily — v1.4.0 daily drama route.
 *
 * GET /me  → today's personalized drama for this X-User-Id.
 *
 * Anonymous users get null (Landing renders the legacy hero CTA
 * unchanged). Identified users get a JSON DailyDrama which the Landing
 * uses to paint the personalized hero card. Same drama all day long
 * (UTC date), reset at midnight via dailyDrama's per-user cache.
 */

import { Hono } from 'hono';
import { getDailyDrama } from '../services/dailyDrama';

export const dailyRoutes = new Hono();

dailyRoutes.get('/me', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId) return c.json({ drama: null });
  const drama = await getDailyDrama(userId);
  return c.json({ drama });
});
