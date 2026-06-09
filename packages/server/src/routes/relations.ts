/**
 * routes/relations.ts — v6.75 — 「AI 记忆关系网」读端点。
 *
 * 数值在 shared/memory 纯引擎跑、GameEngine round-end 钩子喂、relationStore 落盘;这里只读:
 *   · GET /api/relations            → 整张关系图(边带关系档,给「关系网」图谱 UI 画)
 *   · GET /api/relations/:holderId  → 某只鼠的情绪边(给个人关系卡)
 * 节点 id = archetype(持久身份),客户端用 PERSONALITY_REGISTRY 自己补名字/头像。
 */
import { Hono } from 'hono';
import { bondTier, type RelationEdge } from '@furball/shared';
import { getRelationEdges, getEdgesFor } from '../services/relationStore';

export const relationRoutes = new Hono();

function withTier(e: RelationEdge) {
  return { ...e, tier: bondTier(e.score) };
}

relationRoutes.get('/', async (c) => {
  const rawMin = Number(c.req.query('minAbs') ?? 1);
  const minAbs = Number.isFinite(rawMin) ? Math.max(0, Math.min(100, Math.floor(rawMin))) : 1;
  const edges = await getRelationEdges(minAbs);
  return c.json({ edges: edges.map(withTier), total: edges.length });
});

relationRoutes.get('/:holderId', async (c) => {
  const holderId = c.req.param('holderId').slice(0, 40);
  const edges = await getEdgesFor(holderId, 12);
  return c.json({ holderId, edges: edges.map(withTier) });
});
