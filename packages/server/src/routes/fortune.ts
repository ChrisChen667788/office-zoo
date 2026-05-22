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
import { listUserFortuneHistory, recordFortuneDraw } from '../services/fortuneHistoryStore';

export const fortuneRoutes = new Hono();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveUserId(c: { req: { header: (n: string) => string | undefined } }): string {
  return (c.req.header('x-user-id') ?? '').slice(0, 64)
    || c.req.header('host')
    || 'anonymous';
}

fortuneRoutes.get('/me', (c) => {
  const userId = resolveUserId(c);
  const date = todayUTC();
  const card = FORTUNE_DECK[pickFortuneIndex(userId, date)];
  // v5.6.0 — fire-and-forget record into the user's history. Recording
  // is idempotent (same date = no new entry), so refreshing the page
  // doesn't pollute the log. We don't await: a slow disk write
  // shouldn't slow the user's card render.
  void recordFortuneDraw(userId, {
    date,
    cardId: card.id,
    emoji: card.emoji,
    title: card.title,
    vibeScore: card.vibeScore,
    tag: card.tag,
  });
  return c.json({ date, card });
});

/** Read-only deck dump — used by the v5.7.0 /fortune/gallery page
 *  and any future card-detail deep-links. Cheap, no auth. */
fortuneRoutes.get('/deck', (c) => {
  return c.json({ deck: FORTUNE_DECK });
});

/** v5.6.0 — last N entries (default 7 = last week) for the calling
 *  user. Empty list for anonymous / unknown users — the client treats
 *  empty state as "first day, come back tomorrow for history". */
fortuneRoutes.get('/history', async (c) => {
  const userId = resolveUserId(c);
  const limitRaw = parseInt(c.req.query('limit') ?? '7', 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 30) : 7;
  const history = await listUserFortuneHistory(userId, limit);
  return c.json({ history });
});
