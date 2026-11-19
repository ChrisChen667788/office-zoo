/**
 * /api/replay — v6.54 — 🎬 对局回放 read API.
 *
 *   GET /api/replay            → recent replays (digest preview only, no
 *                                full timeline — keeps the list payload small);托管版返回空列表
 *   GET /api/replay/samples    → v6.168 随仓库发布的示例对局列表
 *   GET /api/replay/:gameId    → one full ReplayRecord (roster + timeline);sample-* 读示例对局
 *
 * Write side is the socketHandler game_over hook (saveReplay). Read-only here.
 */
import { Hono } from 'hono';
import { getReplay, listRecentReplays } from '../services/replayStore';
import { getSampleReplay, listSampleReplays } from '../services/sampleReplays';
import { digestReplay, stripHumanTextFromReplay } from '@furball/shared';
import { isHosted } from '../utils/deployProfile';

export const replayRoutes = new Hono();

replayRoutes.get('/', async (c) => {
  // v6.169 — 托管版不列出「最近对局」:那是所有访客的对局(用了公司主题包的还带着用户填的名字),
  // 列出来等于让任何人枚举别人的回放。前端没有用到这个列表;示例对局走 /samples。
  if (isHosted()) return c.json({ replays: [] });
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10) || 20));
  const recent = await listRecentReplays(limit);
  // List view: metadata + digest, NOT the full timeline (could be large).
  return c.json({
    replays: recent.map((r) => ({
      gameId: r.gameId,
      endedAt: r.endedAt,
      winner: r.winner,
      rounds: r.rounds,
      playerCount: r.players.length,
      digest: digestReplay(r.timeline),
    })),
  });
});

// v6.168 — 随仓库发布的示例对局(没配 key 也能看的完整 AI 对局)。注册在 /:gameId 之前。
replayRoutes.get('/samples', (c) => {
  return c.json({
    samples: listSampleReplays().map((r) => ({
      gameId: r.gameId,
      endedAt: r.endedAt,
      winner: r.winner,
      rounds: r.rounds,
      playerCount: r.players.length,
      speechCount: r.speeches?.length ?? 0,
      mode: r.mode ?? 'single',
      digest: digestReplay(r.timeline),
    })),
  });
});

replayRoutes.get('/:gameId', async (c) => {
  const id = c.req.param('gameId');
  const sample = getSampleReplay(id);
  if (sample) return c.json(sample);
  const rec = await getReplay(id);
  if (!rec) return c.json({ error: 'replay_not_found' }, 404);
  // 托管版保存时已去掉真人打的字;这里再去一遍,旧数据或漏网的也不外发。
  return c.json(isHosted() ? stripHumanTextFromReplay(rec) : rec);
});
