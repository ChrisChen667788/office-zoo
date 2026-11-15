/**
 * /api/memory — v5.8.1 polish forget mechanism.
 *
 * 法务安全网 (RFC §5.4): if a user / regulator demands "delete all of
 * this AI's memory of me", we must be able to do it before v5.8.2's
 * per-user binding exists. This version covers the **global** forget
 * surface (delete by archetype / kind / game scope). The per-user
 * scoped forget arrives in v5.8.2 once `target_user_id` actually
 * carries meaningful data.
 *
 * Endpoints:
 *   POST  /api/memory/forget    — DELETE by filters (any combo of archetype/
 *                                  gameId/kind); omit all = wipe everything
 *   GET   /api/memory/stats     — count by archetype; for the upcoming
 *                                  settings UI to show "you have N memories"
 *
 * Auth(v6.162 起;此前完全无鉴权,任何人一个请求就能清空所有角色的跨局记忆):
 *  - 自助删除:只能删请求头 X-User-Id 对应的那个人的记忆(请求体里的 targetUserId 被忽略),
 *    可再按 archetype / gameId / kind 收窄。Settings 页的「忘掉我」走这条。
 *  - 批量删除(不限定用户、按角色或整库清空):必须带 X-Admin-Token == MEMORY_ADMIN_TOKEN;
 *    没配置 MEMORY_ADMIN_TOKEN 时批量删除一律 403。
 */

import { Hono } from 'hono';
import { getPool, ensureSchema } from '../services/pgvectorClient';
import { clearEmbeddingCache } from '../services/memoryEmbedder';
import { logger } from '../utils/logger';
import { timingSafeEqual } from 'node:crypto';

const memLog = logger.child({ route: 'memory' });

export const memoryRoutes = new Hono();

interface ForgetBody {
  /** Limit deletion to memories belonging to this personality archetype. */
  archetype?: string;
  /** Limit deletion to memories sourced from a specific gameId. */
  gameId?: string;
  /** Limit deletion to a specific kind (event/belief/relationship). */
  kind?: string;
  /** v5.8.2 hook — limit to memories about a specific human userId.
   *  v6.162: only honoured for admin requests; self-service uses X-User-Id. */
  targetUserId?: string;
  /** When true, also clears the in-process embedding LRU cache.
   *  Mostly for testing — production deletes don't need it (cache
   *  keys on text content, not memory rows). */
  clearCache?: boolean;
}

/** 常量时间比较,避免按响应时间逐字符猜 token。 */
export function adminTokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const USER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

memoryRoutes.post('/forget', async (c) => {
  let body: ForgetBody;
  try {
    body = await c.req.json() as ForgetBody;
  } catch {
    body = {};
  }

  const isAdmin = adminTokenMatches(c.req.header('x-admin-token'), process.env.MEMORY_ADMIN_TOKEN);
  if (!isAdmin) {
    const selfId = c.req.header('x-user-id')?.trim() ?? '';
    if (!USER_ID_RE.test(selfId)) {
      return c.json({ error: 'forbidden', detail: 'bulk forget requires X-Admin-Token; self-service requires X-User-Id' }, 403);
    }
    body = { ...body, targetUserId: selfId };
  }
  await ensureSchema();

  const filters: string[] = [];
  const params: unknown[] = [];
  if (body.archetype) {
    filters.push(`agent_archetype = $${params.length + 1}`);
    params.push(body.archetype);
  }
  if (body.gameId) {
    filters.push(`source_game_id = $${params.length + 1}`);
    params.push(body.gameId);
  }
  if (body.kind) {
    filters.push(`kind = $${params.length + 1}`);
    params.push(body.kind);
  }
  if (body.targetUserId) {
    filters.push(`target_user_id = $${params.length + 1}`);
    params.push(body.targetUserId);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const { rowCount } = await getPool().query(`DELETE FROM memory_entries ${where}`, params);
    if (body.clearCache) clearEmbeddingCache();
    memLog.info({
      ...body,
      admin: isAdmin,
      deleted: rowCount,
      scope: filters.length ? 'scoped' : 'GLOBAL_WIPE',
    }, 'memory forget');
    return c.json({ deleted: rowCount ?? 0, scope: filters.length ? 'scoped' : 'global' });
  } catch (err) {
    memLog.error({ err: (err as Error).message }, 'forget failed');
    return c.json({ error: 'forget failed' }, 500);
  }
});

memoryRoutes.get('/stats', async (c) => {
  await ensureSchema();
  try {
    const { rows: byArchetype } = await getPool().query<{ archetype: string; count: number }>(
      `SELECT agent_archetype AS archetype, count(*)::int AS count
         FROM memory_entries
        GROUP BY agent_archetype
        ORDER BY count DESC`,
    );
    const { rows: totalRows } = await getPool().query<{ total: number }>(
      `SELECT count(*)::int AS total FROM memory_entries`,
    );
    return c.json({
      total: totalRows[0]?.total ?? 0,
      byArchetype,
    });
  } catch (err) {
    memLog.error({ err: (err as Error).message }, 'stats failed');
    return c.json({ error: 'stats failed' }, 500);
  }
});

/** v6.0.0 — `/beliefs?userId=<id>` returns the high-level beliefs the
 *  Phase B reflection layer has formed about a specific spectator.
 *  Grouped by archetype so the Settings UI can render
 *  "💭 sass-master 对你的判断: 你救过我 ..." per personality.
 *
 *  Each archetype's beliefs are sorted by importance × recency (the
 *  same composite signal recallMemories uses) and capped at 5 per
 *  archetype to keep payload light. */
memoryRoutes.get('/beliefs', async (c) => {
  await ensureSchema();
  const userId = c.req.query('userId');
  if (!userId || userId.length < 8 || userId.length > 64) {
    return c.json({ error: 'userId query param required (8-64 chars)' }, 400);
  }
  try {
    const { rows } = await getPool().query<{
      agent_archetype: string;
      content: string;
      ts: Date;
      importance: number;
      source_game_id: string | null;
    }>(
      `SELECT agent_archetype, content, ts, importance, source_game_id
         FROM memory_entries
        WHERE target_user_id = $1 AND kind = 'belief'
        ORDER BY agent_archetype, ts DESC`,
      [userId],
    );
    // Group by archetype, cap 5 each
    const grouped = new Map<string, Array<typeof rows[number]>>();
    for (const r of rows) {
      const list = grouped.get(r.agent_archetype) ?? [];
      if (list.length < 5) {
        list.push(r);
        grouped.set(r.agent_archetype, list);
      }
    }
    const archetypes = Array.from(grouped.entries()).map(([archetype, beliefs]) => ({
      archetype,
      beliefs: beliefs.map((b) => ({
        content: b.content,
        ts: b.ts,
        importance: b.importance,
        sourceGameId: b.source_game_id,
      })),
    }));
    return c.json({ userId, archetypes });
  } catch (err) {
    memLog.error({ err: (err as Error).message }, 'beliefs failed');
    return c.json({ error: 'beliefs failed' }, 500);
  }
});
