/**
 * routes/reaction.ts — v6.69 — 主对局裁员瞬间「群众吐槽」端点。
 *
 * 客户端在有鼠被优化 / 投票出局时 POST 当局上下文(谁、什么身份/性格、谁动的手),
 * 服务端用 FIRED_HR_MODEL 链路生成一句吃瓜弹幕;失败/超时走 shared 静态池兜底。无状态、限流防刷。
 */
import { Hono } from 'hono';
import { createRateLimiter } from '../utils/rateLimit';
import { generateReactionLine } from '../services/reactionFlavor';
import type { ReactionKind } from '@furball/shared';

export const reactionRoutes = new Hono();

function ipFrom(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

// 一局裁员事件不多(每轮 1-2 次)→ 200/小时 够看好几局,也拦得住脚本刷。
const lineLimiter = createRateLimiter({ windowMs: 3600_000, max: 200 });
const KINDS: ReactionKind[] = ['kill', 'vote', 'leak', 'survive'];
const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

reactionRoutes.post('/line', async (c) => {
  const ip = ipFrom(c);
  const limit = lineLimiter.check(ip);
  if (!limit.ok) {
    return c.json(
      { error: 'rate limited', retryAfterSec: limit.retryAfterSec },
      429,
      { 'Retry-After': String(limit.retryAfterSec) },
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const kind: ReactionKind = KINDS.includes(body?.kind) ? body.kind : 'vote';
  const victimName = str(body?.victimName, 24);
  if (!victimName) return c.json({ error: 'missing victimName' }, 400);

  const line = await generateReactionLine({
    kind,
    victimName,
    victimRole: str(body?.victimRole, 24),
    victimPersonality: str(body?.victimPersonality, 24),
    byName: str(body?.byName, 24),
  });
  return c.json({ line });
});
