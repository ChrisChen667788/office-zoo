/**
 * /api/replay — v6.54 — 🎬 对局回放 read API.
 *
 *   GET /api/replay            → recent replays (digest preview only, no
 *                                full timeline — keeps the list payload small)
 *   GET /api/replay/samples    → v6.168 随仓库发布的示例对局列表
 *   GET /api/replay/:gameId    → one full ReplayRecord (roster + timeline);sample-* 读示例对局
 *
 * Write side is the socketHandler game_over hook (saveReplay). Read-only here.
 */
import { Hono } from 'hono';
import { getReplay, listRecentReplays } from '../services/replayStore';
import { getSampleReplay, listSampleReplays } from '../services/sampleReplays';
import { digestReplay } from '@furball/shared';

export const replayRoutes = new Hono();

replayRoutes.get('/', async (c) => {
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
  return c.json(rec);
});
