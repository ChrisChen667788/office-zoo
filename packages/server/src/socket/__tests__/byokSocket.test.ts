/**
 * v6.167 — BYOK 的 Socket 链路(真实 Socket.IO server + client;对外请求全部 mock)。
 *
 *  - hosted 没配 key:game:create 回 game:error{code:'need_key'},不建局;squad:start 同样拦
 *  - 握手 auth.byok 带上访客凭据:建局者的凭据绑到这局;别人(没配 key 的观众)点开始也用建局者的
 *  - 凭据不出现在下发的对局状态里
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { encodeByok, type ByokConfig } from '@furball/shared';

vi.mock('../../services/tts', () => ({ generateTTSAudio: vi.fn(async () => null) }));
vi.mock('../../services/replayStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/replayStore')>()),
  saveReplay: vi.fn(async () => {}),
}));

const { setupSocketHandler, _getGameForTest, gameAiContext } = await import('../socketHandler');
const { setupSquadHandler } = await import('../squadHandler');
const { attachSocketByok } = await import('../../utils/byokTransport');
const { currentByok } = await import('../../utils/aiClient');

const USER_KEY = 'sk-creator-0123456789abcdef';
const creatorCfg: ByokConfig = { v: 1, provider: 'deepseek', apiKey: USER_KEY, model: 'deepseek-flash' };

let http: HttpServer;
let ioServer: Server;
let url = '';
const clients: ClientSocket[] = [];

beforeAll(async () => {
  http = createServer();
  ioServer = new Server(http);
  attachSocketByok(ioServer);
  setupSocketHandler(ioServer);
  setupSquadHandler(ioServer);
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterEach(() => {
  while (clients.length) clients.pop()!.disconnect();
  delete process.env.DEPLOY_PROFILE;
  vi.restoreAllMocks();
});
afterAll(async () => { await new Promise<void>((r) => ioServer.close(() => r())); });

function connect(byok?: ByokConfig): Promise<ClientSocket> {
  const c = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth: byok ? { byok: encodeByok(byok) } : {} });
  clients.push(c);
  return new Promise((resolve, reject) => { c.once('connect', () => resolve(c)); c.once('connect_error', reject); });
}
const once = <T>(c: ClientSocket, ev: string, ms = 2000) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout waiting ${ev}`)), ms);
  c.once(ev, (d: T) => { clearTimeout(t); resolve(d); });
});

describe('BYOK over Socket.IO', () => {
  it('hosted 没配 key:不建局,回 need_key', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const c = await connect();
    const err = once<{ code?: string }>(c, 'game:error');
    c.emit('game:create', { playerCount: 6, mode: 'classic', userId: 'nokeyuser01', locale: 'zh' });
    expect((await err).code).toBe('need_key');
  });

  it('建局者的凭据绑到这局;没配 key 的观众点开始也用建局者的;状态里没有 key', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const creator = await connect(creatorCfg);
    const created = once<{ gameId: string }>(creator, 'game:created');
    const firstState = once<unknown>(creator, 'game:state');
    creator.emit('game:create', { playerCount: 6, mode: 'classic', userId: 'creator0001', locale: 'zh' });
    const { gameId } = await created;
    expect(JSON.stringify(await firstState)).not.toContain(USER_KEY);
    const engine = _getGameForTest(gameId)!;
    expect(gameAiContext(engine).byok?.apiKey).toBe(USER_KEY);
    expect(JSON.stringify(engine.getSerializedState())).not.toContain(USER_KEY);

    // 观众(没配 key)加入并点开始:引擎主循环应在建局者的凭据上下文里启动
    const viewer = await connect();
    viewer.emit('game:join', gameId);
    let seen: string | null | undefined;
    const startSpy = vi.spyOn(engine, 'startGame').mockImplementation(async () => { seen = currentByok()?.apiKey ?? null; });
    viewer.emit('game:start', gameId);
    await vi.waitFor(() => expect(startSpy).toHaveBeenCalled());
    expect(seen).toBe(USER_KEY);
  });

  it('hosted 攒局:host 没配 key 时 squad:start 回 need_key,不进入编剧', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const host = await connect();
    const created = once<{ id: string }>(host, 'squad:state');
    host.emit('squad:create', {});
    const room = await created;
    const guest = await connect();
    const joined = once<unknown>(guest, 'squad:state');
    guest.emit('squad:join', { roomId: room.id });
    await joined;
    const err = once<{ code?: string }>(host, 'squad:error');
    host.emit('squad:start', { roomId: room.id });
    expect((await err).code).toBe('need_key');
  });
});
