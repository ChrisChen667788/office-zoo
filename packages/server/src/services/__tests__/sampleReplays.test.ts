/**
 * v6.168 — 示例对局:脱敏规则 + 回放记录发言(集成)。
 *
 * 示例对局随仓库公开发布,所以脱敏是硬要求:真人打的字(占座发言、场边真人发言)一律去掉;
 * 玩家名不在内置 AI 名单里(自定义公司主题包,名字是用户填的)直接拒绝。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import type { ReplayRecord, GameEvent } from '@furball/shared';
import { compactReplaySpeeches, groupReplayByRound, REPLAY_MAX_SPEECHES, REPLAY_MAX_SPEECH_CHARS } from '@furball/shared';
import { AI_NAMES } from '../../engine/aiNames';
import { sanitizeForSample, SAMPLE_PREFIX } from '../sampleReplays';

const saved: ReplayRecord[] = [];
vi.mock('../replayStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../replayStore')>()),
  saveReplay: vi.fn(async (r: ReplayRecord) => { saved.push(r); }),
}));
vi.mock('../tts', () => ({ generateTTSAudio: vi.fn(async () => null) }));

const ev = (round: number, type: string, description: string): GameEvent =>
  ({ round, type, description, timestamp: round, phase: 'discussion' } as unknown as GameEvent);

function rec(over: Partial<ReplayRecord> = {}): ReplayRecord {
  return {
    gameId: 'game_1791428615133', endedAt: 1, winner: 'cat_win' as ReplayRecord['winner'], rounds: 2,
    players: [{ id: 'p0', name: 'Tony', isAlive: true }, { id: 'p1', name: '小王', isAlive: false }],
    timeline: [ev(1, 'kill', 'x'), ev(1, 'human_speech', '🎤 场边:我的手机号 138xxxx'), ev(2, 'vote_out', 'y')],
    speeches: [
      { round: 1, playerId: 'p0', playerName: 'Tony', text: 'AI 的发言' },
      { round: 1, playerId: 'p1', playerName: '小王', text: '真人打的字', byHuman: true },
    ],
    ...over,
  };
}

describe('sanitizeForSample', () => {
  it('去掉真人发言与真人场边事件;改 id、打 sample 标记', () => {
    const r = sanitizeForSample(rec(), AI_NAMES);
    expect(r.ok).toBe(true);
    expect(r.record!.gameId).toBe(`${SAMPLE_PREFIX}1791428615133`);
    expect(r.record!.sample).toBe(true);
    expect(r.record!.speeches!.map((s) => s.text)).toEqual(['AI 的发言']);
    expect(r.record!.timeline.map((e) => e.type)).toEqual(['kill', 'vote_out']);
    expect(r.dropped).toEqual({ humanSpeeches: 1, userTextEvents: 1 });
    expect(JSON.stringify(r.record)).not.toContain('真人打的字');
    expect(JSON.stringify(r.record)).not.toContain('138');
  });

  it('自定义公司主题包的名字(用户填的)→ 拒绝', () => {
    const r = sanitizeForSample(rec({ players: [{ id: 'p0', name: '我老板王建国', isAlive: true }] }), AI_NAMES);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('我老板王建国');
  });

  it('没有 AI 发言(老回放 / 只有真人发言)→ 拒绝', () => {
    expect(sanitizeForSample(rec({ speeches: undefined }), AI_NAMES).ok).toBe(false);
    expect(sanitizeForSample(rec({ speeches: [{ round: 1, playerId: 'p1', playerName: '小王', text: 'x', byHuman: true }] }), AI_NAMES).ok).toBe(false);
  });
});

describe('回放发言工具', () => {
  it('compactReplaySpeeches 限条数、截长度、丢多余字段', () => {
    const many = Array.from({ length: REPLAY_MAX_SPEECHES + 5 }, (_, i) => ({
      round: 1, playerId: 'p', playerName: 'Tony', text: '字'.repeat(REPLAY_MAX_SPEECH_CHARS + 10), extra: i,
    }));
    const out = compactReplaySpeeches(many);
    expect(out).toHaveLength(REPLAY_MAX_SPEECHES);
    expect([...out[0].text]).toHaveLength(REPLAY_MAX_SPEECH_CHARS);
    expect(Object.keys(out[0]).sort()).toEqual(['playerId', 'playerName', 'round', 'text']);
  });

  it('groupReplayByRound 合并事件与发言,只有发言的回合也保留', () => {
    const g = groupReplayByRound([ev(1, 'kill', 'a'), ev(3, 'vote_out', 'b')], [
      { round: 2, playerId: 'p', playerName: 'Tony', text: 'hi' },
      { round: 1, playerId: 'p', playerName: 'Tony', text: 'yo' },
    ]);
    expect(g.map((x) => [x.round, x.events.length, x.speeches.length])).toEqual([[1, 1, 1], [2, 0, 1], [3, 1, 0]]);
  });
});

describe('对局发言真的写进回放(真实 Socket.IO + 引擎事件)', () => {
  let http: HttpServer;
  let ioServer: Server;
  let url = '';
  beforeAll(async () => {
    const { setupSocketHandler } = await import('../../socket/socketHandler');
    http = createServer();
    ioServer = new Server(http);
    setupSocketHandler(ioServer);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => ioServer.close(() => r())); });

  it('AI 发言记入、真人占座发言带 byHuman 标记', async () => {
    const { _getGameForTest } = await import('../../socket/socketHandler');
    const c = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((r, j) => { c.once('connect', () => r()); c.once('connect_error', j); });
    const { gameId } = await new Promise<{ gameId: string }>((r) => {
      c.once('game:created', r);
      c.emit('game:create', { playerCount: 6, mode: 'classic', userId: 'replaytest01', locale: 'zh' });
    });
    c.disconnect(); // 房间没人 → 播放队列直接跳过,不等 TTS
    await new Promise((r) => setTimeout(r, 50));
    const engine = _getGameForTest(gameId)!;
    engine.createPlayers(); // 不调 game:start(那会推进阶段、调模型),只把阵容建出来
    const [ai, human] = engine.state.players;
    human.controller = 'human';
    engine.emit('discussion_speeches', [
      { playerId: ai.id, playerName: ai.name, text: 'AI 说的话' },
      { playerId: human.id, playerName: human.name, text: '真人打的字' },
    ]);
    engine.emit('game_over', { winner: 'cat_win' });
    await new Promise((r) => setTimeout(r, 50));
    const r = saved.find((x) => x.gameId === gameId)!;
    expect(r).toBeDefined();
    expect(r.speeches).toEqual([
      expect.objectContaining({ playerId: ai.id, text: 'AI 说的话' }),
      expect.objectContaining({ playerId: human.id, text: '真人打的字', byHuman: true }),
    ]);
    expect(r.speeches![0].byHuman).toBeUndefined();
  });
});
