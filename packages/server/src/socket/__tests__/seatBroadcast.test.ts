/**
 * v6.160 — 占座/退座必须立刻向全房广播 game:state(集成审查确认的 bug)。
 *
 * 之前 claim_seat 只广播 seat_claims 位图,player.controller 的变化要等下一次 phase_change
 * 才随 game:state 到达其他客户端,👤 标记因此延迟一整个阶段。这里起真实的 Socket.IO
 * server + 两个真实 client:A 占座/退座/断线,断言 B 在没有任何阶段切换的情况下收到
 * controller 已更新的 game:state。不调 game:start,所以不会触发 LLM 或阶段推进。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { GamePhase } from '@furball/shared';
import { setupSocketHandler, _getGameForTest } from '../socketHandler';

type WirePlayer = { id: string; controller?: string; isAlive: boolean };
type WireState = { players: WirePlayer[] };

let http: HttpServer;
let ioServer: Server;
let url = '';
const clients: ClientSocket[] = [];

beforeAll(async () => {
  http = createServer();
  ioServer = new Server(http);
  setupSocketHandler(ioServer);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(() => {
  while (clients.length) clients.pop()!.disconnect();
});

afterAll(async () => {
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
});

function connect(): Promise<ClientSocket> {
  const c = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(c);
  return new Promise((resolve, reject) => {
    c.once('connect', () => resolve(c));
    c.once('connect_error', reject);
  });
}

/** 等下一个满足条件的事件;超时即失败(说明广播没发生)。 */
function waitFor<T>(c: ClientSocket, event: string, pred: (p: T) => boolean = () => true, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      c.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, ms);
    function handler(payload: T) {
      if (!pred(payload)) return;
      clearTimeout(timer);
      c.off(event, handler);
      resolve(payload);
    }
    c.on(event, handler);
  });
}

const controllerOf = (s: WireState, id: string) => s.players.find((p) => p.id === id)?.controller;

/** A 建局并铺好玩家(不开局),B 加入同一房间。 */
async function setupRoom() {
  const a = await connect();
  const created = waitFor<{ gameId: string }>(a, 'game:created');
  a.emit('game:create', { playerCount: 8 });
  const { gameId } = await created;
  const engine = _getGameForTest(gameId)!;
  engine.createPlayers();
  const playerId = engine.getSerializedState().players.find((p) => p.isAlive)!.id;

  const b = await connect();
  const joined = waitFor<WireState>(b, 'game:state');
  b.emit('game:join', gameId);
  await joined; // 加入时的那一帧,不算
  return { a, b, engine, playerId };
}

describe('v6.160 — 席位变化立刻广播 game:state', () => {
  it('占座后旁观者立刻收到 controller=human,退座后立刻回到 ai', async () => {
    const { a, b, playerId } = await setupRoom();

    const humanState = waitFor<WireState>(b, 'game:state', (s) => controllerOf(s, playerId) === 'human');
    const claimed = waitFor<{ ok: boolean }>(a, 'game:claim_seat_result');
    a.emit('game:claim_seat', { playerId });
    expect((await claimed).ok).toBe(true);
    await humanState;

    const aiState = waitFor<WireState>(b, 'game:state', (s) => controllerOf(s, playerId) === 'ai');
    a.emit('game:release_seat');
    await aiState;
  });

  it('占座者断线后旁观者立刻收到 controller=ai', async () => {
    const { a, b, playerId } = await setupRoom();
    const humanState = waitFor<WireState>(b, 'game:state', (s) => controllerOf(s, playerId) === 'human');
    a.emit('game:claim_seat', { playerId });
    await humanState;

    const aiState = waitFor<WireState>(b, 'game:state', (s) => controllerOf(s, playerId) === 'ai');
    a.disconnect();
    await aiState;
  });

  it('占座者离场(game:leave)后旁观者立刻收到 controller=ai', async () => {
    const { a, b, playerId } = await setupRoom();
    const humanState = waitFor<WireState>(b, 'game:state', (s) => controllerOf(s, playerId) === 'human');
    a.emit('game:claim_seat', { playerId });
    await humanState;

    const aiState = waitFor<WireState>(b, 'game:state', (s) => controllerOf(s, playerId) === 'ai');
    a.emit('game:leave');
    await aiState;
  });

  it('投票进行中占座:广播的 game:state 不带票型(已投出的 AI 票不提前暴露)', async () => {
    const { a, b, engine, playerId } = await setupRoom();
    const st = (engine as unknown as { state: { phase: string; votes: Record<string, string> } }).state;
    st.phase = GamePhase.VOTING;
    st.votes = { someVoter: 'someTarget' };

    const broadcast = waitFor<WireState & { votes: Record<string, string> }>(
      b, 'game:state', (s) => controllerOf(s, playerId) === 'human');
    a.emit('game:claim_seat', { playerId });
    expect((await broadcast).votes).toEqual({});
    expect(st.votes).toEqual({ someVoter: 'someTarget' }); // 引擎内的票没被动
  });

  it('投票进行中加入的观众拿到的状态也不带票型;非投票阶段照常带(对照组)', async () => {
    const { engine } = await setupRoom();
    const st = (engine as unknown as { state: { id: string; phase: string; votes: Record<string, string> } }).state;
    const gameId = engine.getSerializedState().id;
    st.votes = { someVoter: 'someTarget' };

    st.phase = GamePhase.VOTING;
    const c = await connect();
    const mid = waitFor<{ votes: Record<string, string> }>(c, 'game:state');
    c.emit('game:join', gameId);
    expect((await mid).votes).toEqual({});

    st.phase = GamePhase.VOTE_RESULT;
    const d = await connect();
    const after = waitFor<{ votes: Record<string, string> }>(d, 'game:state');
    d.emit('game:join', gameId);
    expect((await after).votes).toEqual({ someVoter: 'someTarget' });
  });

  it('引擎拒绝占座(已终局)时回执失败、不发身份卡、席位不被占', async () => {
    const { a, b, engine, playerId } = await setupRoom();
    (engine as unknown as { state: { phase: string } }).state.phase = GamePhase.GAME_OVER;

    let gotSeatYou = false;
    a.on('game:seat_you', () => { gotSeatYou = true; });
    let gotClaims = false;
    b.on('game:seat_claims', () => { gotClaims = true; });

    const result = waitFor<{ ok: boolean; reason?: string }>(a, 'game:claim_seat_result');
    a.emit('game:claim_seat', { playerId });
    const r = await result;
    expect(r).toEqual({ ok: false, reason: 'game_over' });
    // 给可能的错误广播留一点时间
    await new Promise((res) => setTimeout(res, 150));
    expect(gotSeatYou).toBe(false);
    expect(gotClaims).toBe(false);
    expect(controllerOf(engine.getSerializedState() as WireState, playerId)).not.toBe('human');
  });
});
