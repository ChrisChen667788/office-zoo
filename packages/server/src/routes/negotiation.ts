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
import { cardById, STANCE_POOL, type HRStanceId } from '@furball/shared';

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
