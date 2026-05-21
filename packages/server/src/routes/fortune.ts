/**
 * /api/fortune — v5.4.0 班味占卜 (daily fortune).
 *
 * Anonymous-friendly. Each (X-User-Id, UTC date) deterministically
 * picks a single card from FORTUNE_DECK. Same user opening twice
 * the same day = same card; midnight UTC = new card.
 *
 * For anonymous users (no X-User-Id), we use the IP-equivalent
 * "host" header as a stable-enough seed so the same browser tab
 * doesn't re-roll on refresh.
 */

import { Hono } from 'hono';
import { FORTUNE_DECK, pickFortuneIndex } from '@furball/shared';

export const fortuneRoutes = new Hono();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

fortuneRoutes.get('/me', (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64)
    || c.req.header('host')
    || 'anonymous';
  const date = todayUTC();
  const card = FORTUNE_DECK[pickFortuneIndex(userId, date)];
  return c.json({ date, card });
});

/** Read-only deck dump — useful for the client's "翻看牌库" gallery
 *  if/when we surface one. Cheap, no auth. */
fortuneRoutes.get('/deck', (c) => {
  return c.json({ deck: FORTUNE_DECK });
});
