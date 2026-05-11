/**
 * /api/b2b — v1.1.0 B2B (white-label embed) routes.
 *
 *   GET  /b2b/configs       list all embeds (or filter by createdBy)
 *   GET  /b2b/configs/:id   fetch one
 *   POST /b2b/configs       create one (5/hr/IP rate limit — abuse guard)
 *
 * Authentication: same pseudonymous X-User-Id pattern as everywhere else.
 * No real auth — that's a v1.2+ feature. The threat model here is just
 * "random visitor spamming configs"; the rate limit + length caps cover it.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../utils/validate';
import { createRateLimiter } from '../utils/rateLimit';
import {
  listConfigs,
  findConfig,
  addConfig,
  mintConfigId,
} from '../services/b2bStore';
import { logger } from '../utils/logger';
import type { B2bConfig } from '@furball/shared';

const log = logger.child({ component: 'b2b' });
const limiter = createRateLimiter({ windowMs: 3600_000, max: 5 });

function ipFromHono(c: { req: { header: (k: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip');
  if (fwd) return fwd.split(',')[0].trim();
  return c.req.header('host') ?? 'unknown';
}

export const b2bRoutes = new Hono();

const CreateSchema = z.object({
  brandName:        z.string().min(2).max(48),
  primaryColor:     z.string().regex(/^#[0-9A-Fa-f]{6}$/, '颜色必须是 #RRGGBB 格式'),
  logoUrl:          z.string().url().max(500).optional(),
  leadCaptureEmail: z.string().email().max(120).optional(),
  flavor:           z.enum(['consultation', 'training']),
  defaultScenarioId: z.string().min(1).max(64).optional(),
  footerTagline:    z.string().max(80).optional(),
});

b2bRoutes.get('/configs', async (c) => {
  const createdBy = c.req.query('createdBy');
  const all = await listConfigs();
  const filtered = createdBy ? all.filter((cfg) => cfg.createdBy === createdBy) : all;
  return c.json({ configs: filtered });
});

b2bRoutes.get('/configs/:id', async (c) => {
  const id = c.req.param('id');
  const cfg = await findConfig(id);
  if (!cfg) return c.json({ error: 'embed config 不存在' }, 404);
  return c.json(cfg);
});

b2bRoutes.post('/configs', async (c) => {
  const ip = ipFromHono(c);
  const limit = limiter.check(ip);
  if (!limit.ok) {
    return c.json({
      error: 'rate limited',
      message: `每小时最多创建 5 个 embed,${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试`,
      retryAfterSec: limit.retryAfterSec,
    }, 429, { 'Retry-After': String(limit.retryAfterSec) });
  }
  const v = await validateBody(c, CreateSchema);
  if (!v.ok) return v.response;

  const createdBy = (c.req.header('x-user-id') ?? '').slice(0, 64) || undefined;
  const cfg: B2bConfig = {
    id: mintConfigId(),
    ...v.data,
    createdBy,
    createdAt: Date.now(),
  };
  await addConfig(cfg);
  log.info('B2B embed created', {
    id: cfg.id, brand: cfg.brandName, flavor: cfg.flavor,
    createdBy: createdBy ? createdBy.slice(0, 8) + '…' : 'anon',
  });
  return c.json(cfg);
});
