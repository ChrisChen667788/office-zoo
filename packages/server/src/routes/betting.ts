/**
 * routes/betting.ts — v6.74 P3 — 观众下注盘「全网战绩榜」端点。
 *
 * 数值引擎在客户端(shared/betting)跑;服务端只做榜单 I/O:结算后客户端 POST 当前身家快照
 * {chips, settled, hits, bestWin, lifetimeWon},服务端按 userId 留**身家最高**一条(算分/
 * 留最佳/排名复用 shared 纯函数,ts + userId 服务端注入,不信任客户端)。限流防灌榜。
 */
import { Hono } from 'hono';
import { createRateLimiter } from '../utils/rateLimit';
import { type BetRunSubmit, type BetSortBy } from '@furball/shared';
import { submitBetRun, topBetRuns, totalBetRuns } from '../services/bettingStore';

export const bettingRoutes = new Hono();

function ipFrom(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

const LB_MAX = 50;
// 结算后才上报,但一局好几回合都可能上报 → 240/小时 够连打,也拦得住脚本灌榜。
const scoreLimiter = createRateLimiter({ windowMs: 3600_000, max: 240 });

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
/** 截断 userId 防止泄露累积(8 char 够自己认出自己,不够指认别人)。 */
function pub<T extends { userId: string }>(r: T): T {
  return { ...r, userId: r.userId.slice(0, 8) };
}
function parseSort(v: string | undefined): BetSortBy {
  return v === 'hitRate' ? 'hitRate' : 'chips';
}

bettingRoutes.post('/score', async (c) => {
  const ip = ipFrom(c);
  const lim = scoreLimiter.check(ip);
  if (!lim.ok) {
    return c.json({ error: 'rate limited', retryAfterSec: lim.retryAfterSec }, 429, { 'Retry-After': String(lim.retryAfterSec) });
  }
  const userId = (c.req.header('x-user-id') ?? '').trim().slice(0, 64);
  if (!userId) return c.json({ error: 'missing X-User-Id' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const settled = clampInt(body?.settled, 0, 999999, 0);
  const submit: BetRunSubmit = {
    chips: clampInt(body?.chips, 0, 9_999_999, 0),
    settled,
    hits: clampInt(body?.hits, 0, settled, 0),        // 押中不可能多于结算
    bestWin: clampInt(body?.bestWin, 0, 9_999_999, 0),
    lifetimeWon: clampInt(body?.lifetimeWon, 0, 99_999_999, 0),
  };

  const best = await submitBetRun(userId, submit, Date.now());
  const all = await topBetRuns(9999, 'chips');
  const rank = all.findIndex((r) => r.userId === userId) + 1;
  return c.json({ ok: true, best: pub(best), rank, total: all.length });
});

bettingRoutes.get('/leaderboard', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? 20);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(LB_MAX, Math.floor(rawLimit))) : 20;
  const sortBy = parseSort(c.req.query('sort'));
  const runs = await topBetRuns(limit, sortBy);
  return c.json({ top: runs.map(pub), total: await totalBetRuns(), sort: sortBy });
});
