/**
 * /api/leaderboard — v6.36 P4 spectator 班味 leaderboard.
 *
 * Cross-user ranking surface — flips the v6.32 P5 banwei score from
 * a private "你这周有多班味" personal report to a public "全网 top-10
 * 班味打工人" wall. Reads the same banwei.json store the per-user
 * GET /api/banwei route writes to, so there's NO new persistence —
 * leaderboard is just a different reducer over existing data.
 *
 * ## Privacy model
 *
 * X-User-Id headers are arbitrary client-generated strings (currently
 * `uid-…` from utils/uid). They can be reset by the user any time, and
 * we don't tie them back to wechat/oauth identity. To prevent leak
 * accumulation we still truncate them to the first 8 chars in the
 * public response — short enough that the rank is anonymous, long
 * enough that a returning user can recognize their own row.
 *
 * ## Endpoint
 *
 *   GET /api/leaderboard/banwei?limit=10
 *     → { top: [{ userIdPrefix, score, weekKey }, ...], total, weekKey }
 *
 * Default limit 10, hard-capped 50 to discourage scraping. Result is
 * sorted by score descending, weekKey-tie-broken by takenAt asc (older
 * snapshots first — rewards stickiness over recency).
 */
import { Hono } from 'hono';
import {
  isoWeekKey, loadBanweiStoreReadonly,
  KNOWN_REGIONS, KNOWN_INDUSTRIES,
  type BanweiSnapshot,
} from './banwei';

export const leaderboardRoutes = new Hono();

/** Hard cap on `limit` query param. Larger numbers don't add value
 *  for a public top-N wall and risk turning the endpoint into a
 *  bulk scrape. */
const MAX_LIMIT = 50;
/** Truncate userId to this length in the response. 8 hex chars from a
 *  uid is enough to recognize your own row but not enough to identify
 *  another spectator. */
const ID_PREFIX_LEN = 8;

interface LeaderboardRow {
  userIdPrefix: string;
  score: number;
  weekKey: string;
  region?: string;
  industry?: string;
}

/** Narrow a query-param string to a known tribe value, mirroring
 *  the banwei route's POST validation. */
function pickFilter<T extends string>(v: string | undefined, pool: readonly T[]): T | undefined {
  if (!v) return undefined;
  const t = v.trim().toLowerCase().slice(0, 32);
  return (pool as readonly string[]).includes(t) ? (t as T) : undefined;
}

leaderboardRoutes.get('/banwei', async (c) => {
  const wantWeek = c.req.query('week') ?? isoWeekKey();
  const rawLimit = Number(c.req.query('limit') ?? 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit)))
    : 10;
  // v6.37 P1 — tribe filters. Invalid values silently ignored
  // (validated against the canonical pools from banwei.ts).
  const wantRegion = pickFilter(c.req.query('region'), KNOWN_REGIONS);
  const wantIndustry = pickFilter(c.req.query('industry'), KNOWN_INDUSTRIES);

  const { byUser } = await loadBanweiStoreReadonly();

  // For each user, find their snapshot for the requested week. Fall back
  // to their MOST RECENT snapshot if they don't have an entry for the
  // exact week (avoids empty leaderboard on Monday morning before anyone
  // has logged a current-week score).
  const rows: LeaderboardRow[] = [];
  for (const [userId, snaps] of Object.entries(byUser)) {
    if (!snaps?.length) continue;
    const exact = snaps.find((s) => s.weekKey === wantWeek);
    const snap: BanweiSnapshot | undefined = exact ?? snaps[snaps.length - 1];
    if (!snap) continue;
    // v6.37 P1 — apply tribe filters. Snapshot without the field
    // is rejected so a pre-v6.37 row never satisfies a filter.
    if (wantRegion && snap.region !== wantRegion) continue;
    if (wantIndustry && snap.industry !== wantIndustry) continue;
    rows.push({
      userIdPrefix: userId.slice(0, ID_PREFIX_LEN),
      score: snap.score,
      weekKey: snap.weekKey,
      ...(snap.region ? { region: snap.region } : {}),
      ...(snap.industry ? { industry: snap.industry } : {}),
    });
  }

  // Sort: score desc, then weekKey desc (newer week tie-break wins so
  // a stale 80 from 6 weeks ago can't pin out a fresh 80).
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.weekKey.localeCompare(a.weekKey);
  });

  return c.json({
    top: rows.slice(0, limit),
    total: rows.length,
    weekKey: wantWeek,
    filters: {
      ...(wantRegion ? { region: wantRegion } : {}),
      ...(wantIndustry ? { industry: wantIndustry } : {}),
    },
  });
});
