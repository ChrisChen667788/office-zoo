/**
 * routes/negotiation.ts — v6.58 — 「裁了么」闯关牌局的 HR 台词端点。
 *
 * 数值引擎在客户端(shared/negotiation)跑,服务端只做无状态的台词生成:客户端
 * 出一张牌就 POST 上来 {cardId, stanceId, outcomeKind},服务端按 id 校验 + 取
 * blurb(不信任客户端文案)→ LLM 生成 HR 那句台词。限流防刷。
 */
import { Hono } from 'hono';
import { createRateLimiter } from '../utils/rateLimit';
import { generateHRLine, type NegotiationOutcomeKind } from '../services/negotiationFlavor';
import { cardById, STANCE_POOL, BOSS_TIERS, type HRStanceId, type NegRunSubmit } from '@furball/shared';
import { submitRun, topRuns, totalRuns } from '../services/negRunStore';

export const negotiationRoutes = new Hono();

function ipFrom(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

// 一局牌局约 10-20 次出牌 → 120/小时 够玩好几局,又拦得住脚本刷。
const hrLineLimiter = createRateLimiter({ windowMs: 3600_000, max: 120 });

const OUTCOME_KINDS: NegotiationOutcomeKind[] = ['ongoing', 'settled', 'caved', 'flipped'];

negotiationRoutes.post('/hr-line', async (c) => {
  const ip = ipFrom(c);
  const limit = hrLineLimiter.check(ip);
  if (!limit.ok) {
    return c.json(
      { error: 'rate limited', retryAfterSec: limit.retryAfterSec },
      429,
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const cardId = typeof body?.cardId === 'string' ? body.cardId : '';
  const stanceId = typeof body?.stanceId === 'string' ? body.stanceId : '';
  const outcomeKind: NegotiationOutcomeKind = OUTCOME_KINDS.includes(body?.outcomeKind)
    ? body.outcomeKind
    : 'ongoing';

  if (!cardById(cardId)) return c.json({ error: 'unknown cardId' }, 400);
  if (!STANCE_POOL.some((s) => s.id === stanceId)) return c.json({ error: 'unknown stanceId' }, 400);

  const line = await generateHRLine({ cardId, stanceId: stanceId as HRStanceId, outcomeKind });
  return c.json({ line });
});

// ---------------------------------------------------------------------------
// v6.66 — 全网战绩榜:打完上报一局,服务端按 userId 留个人最佳;读 top-N。
// 算分/留最佳/排名复用 shared 纯函数;ts + userId 服务端注入,不信任客户端。
// ---------------------------------------------------------------------------
const VIBES = ['win', 'meh', 'lose'] as const;
const OUTCOME_KEPT = ['settled', 'caved', 'flipped'] as const;
const BOSS_IDS = new Set(BOSS_TIERS.map((b) => b.id));
const LB_MAX = 50;
// 一局打完才上报一次 → 60/小时 够连打,也拦得住脚本灌榜。
const scoreLimiter = createRateLimiter({ windowMs: 3600_000, max: 60 });

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
/** 截断 userId 防止泄露累积(8 char 够自己认出自己,不够指认别人)。 */
function pub(r: { userId: string }): typeof r {
  return { ...r, userId: r.userId.slice(0, 8) };
}

negotiationRoutes.post('/score', async (c) => {
  const ip = ipFrom(c);
  const lim = scoreLimiter.check(ip);
  if (!lim.ok) {
    return c.json({ error: 'rate limited', retryAfterSec: lim.retryAfterSec }, 429, { 'Retry-After': String(lim.retryAfterSec) });
  }
  const userId = (c.req.header('x-user-id') ?? '').trim().slice(0, 64);
  if (!userId) return c.json({ error: 'missing X-User-Id' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const bossId = str(body?.bossId, 16);
  if (!BOSS_IDS.has(bossId)) return c.json({ error: 'unknown bossId' }, 400);

  const submit: NegRunSubmit = {
    severance: clampInt(body?.severance, 0, 9999, 0),
    xp: clampInt(body?.xp, 0, 99999, 0),
    outcomeKind: (OUTCOME_KEPT as readonly string[]).includes(body?.outcomeKind) ? body.outcomeKind : 'flipped',
    tier: clampInt(body?.tier, 0, 3, 0),
    multiple: str(body?.multiple, 12) || '未谈成',
    bossId,
    bossName: str(body?.bossName, 24) || bossId,
    bossEmoji: str(body?.bossEmoji, 8) || '🧑‍💼',
    careerTitle: str(body?.careerTitle, 24) || '实习生',
    vibe: (VIBES as readonly string[]).includes(body?.vibe) ? body.vibe : 'lose',
    rounds: clampInt(body?.rounds, 0, 99, 0),
    ...(typeof body?.relicName === 'string' && body.relicName ? { relicName: body.relicName.slice(0, 24) } : {}),
  };

  const best = await submitRun(userId, submit, Date.now());
  const all = await topRuns(9999);
  const rank = all.findIndex((r) => r.userId === userId) + 1;
  return c.json({ ok: true, best: pub(best), rank, total: all.length });
});

negotiationRoutes.get('/leaderboard', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? 20);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(LB_MAX, Math.floor(rawLimit))) : 20;
  const runs = await topRuns(limit);
  return c.json({ top: runs.map(pub), total: await totalRuns() });
});
