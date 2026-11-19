/**
 * v6.162 — 安全三件套 + IP 取值回归。
 *
 *  1. Origin 白名单:HTTP 不放行的跨站 Origin 直接 403(不只是不回 CORS 头);Socket.IO 握手
 *     (WebSocket 传输,不受 CORS 约束)同样被拒——起真实 server 验。
 *  2. 客户端 IP:伪造的 X-Forwarded-For 绕不过限流(取可信代理追加的那一项)。
 *  3. /api/memory/forget:无 token 的批量删除 403;自助删除只能删 X-User-Id 本人,
 *     请求体里塞别人的 targetUserId 无效。
 *  4. /api/tts/generate:超额 429。
 *  5. 限流器的键会被清扫,不随 IP 数无限增长。
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Hono } from 'hono';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';

const queries: Array<{ sql: string; params: unknown[] }> = [];
vi.mock('../../services/pgvectorClient', () => ({
  ensureSchema: vi.fn(async () => {}),
  getPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rowCount: 3, rows: [] };
    }),
  }),
}));
vi.mock('../../services/memoryEmbedder', () => ({ clearEmbeddingCache: vi.fn() }));
vi.mock('../../services/tts', () => ({
  generateTTSAudio: vi.fn(async () => Buffer.from([0x49, 0x44, 0x33])),
}));

import { isOriginAllowed, originGuardMiddleware, corsForAllowedOrigins, socketOriginOptions } from '../originGuard';
import { clientIp, pickForwardedFor } from '../clientIp';
import { createRateLimiter } from '../rateLimit';
import { memoryRoutes, adminTokenMatches } from '../../routes/memory';
import { ttsRoutes } from '../../routes/tts';

const ENV_KEYS = ['DEPLOY_PROFILE', 'ALLOWED_ORIGINS', 'TRUST_PROXY_HOPS', 'MEMORY_ADMIN_TOKEN', 'TTS_RATE_LIMIT_PER_HOUR'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  queries.length = 0;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('isOriginAllowed', () => {
  it('没有 Origin(curl / 服务端 / 爬虫)放行', () => {
    expect(isOriginAllowed(undefined, 'zoo.example.com')).toBe(true);
  });
  it('同源放行(托管时前端与 API 同域同端口)', () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(isOriginAllowed('https://zoo.example.com', 'zoo.example.com')).toBe(true);
  });
  it('本机开发:未配置白名单时放行回环任意端口,拒绝外站', () => {
    expect(isOriginAllowed('http://localhost:5173', 'localhost:3100')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:4173', 'localhost:3100')).toBe(true);
    expect(isOriginAllowed('https://evil.example', 'localhost:3100')).toBe(false);
  });
  it('hosted 不再放行回环(公网上 localhost 来源没有意义)', () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(isOriginAllowed('http://localhost:5173', 'zoo.example.com')).toBe(false);
  });
  it('ALLOWED_ORIGINS 精确匹配完整 origin(尾斜杠无所谓),子域名 / 换协议不算', () => {
    process.env.ALLOWED_ORIGINS = 'https://zoo.example.com/, https://cdn.example.com';
    expect(isOriginAllowed('https://zoo.example.com', 'api.example.com')).toBe(true);
    expect(isOriginAllowed('https://cdn.example.com', 'api.example.com')).toBe(true);
    expect(isOriginAllowed('http://zoo.example.com', 'api.example.com')).toBe(false);
    expect(isOriginAllowed('https://evil.zoo.example.com', 'api.example.com')).toBe(false);
    // 配了白名单就不再隐式放行回环
    expect(isOriginAllowed('http://localhost:5173', 'api.example.com')).toBe(false);
  });
  it('畸形 / 非 http(s) Origin 拒绝', () => {
    expect(isOriginAllowed('null', 'zoo.example.com')).toBe(false);
    expect(isOriginAllowed('file:///etc/passwd', 'zoo.example.com')).toBe(false);
  });
});

describe('HTTP originGuardMiddleware', () => {
  function app() {
    const a = new Hono();
    a.use('*', originGuardMiddleware);
    a.use('*', corsForAllowedOrigins());
    a.post('/api/x', (c) => c.json({ ran: true }));
    return a;
  }

  it('外站 Origin 的 POST 直接 403,处理函数不执行', async () => {
    const res = await app().request('http://localhost:3100/api/x', {
      method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' }, body: 'x',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'origin_not_allowed' });
  });

  it('外站的 CORS 预检同样 403', async () => {
    const res = await app().request('http://localhost:3100/api/x', {
      method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(403);
  });

  it('白名单来源回显 CORS 头;同源不需要 CORS 头也能用', async () => {
    process.env.ALLOWED_ORIGINS = 'https://zoo.example.com';
    const cross = await app().request('http://api.example.com/api/x', {
      method: 'POST', headers: { Origin: 'https://zoo.example.com', Host: 'api.example.com' },
    });
    expect(cross.status).toBe(200);
    expect(cross.headers.get('access-control-allow-origin')).toBe('https://zoo.example.com');

    const same = await app().request('http://api.example.com/api/x', {
      method: 'POST', headers: { Origin: 'http://api.example.com', Host: 'api.example.com' },
    });
    expect(same.status).toBe(200);
  });
});

describe('Socket.IO 握手 Origin 校验(真实 server,WebSocket 传输)', () => {
  let http: HttpServer;
  let ioServer: Server;
  let url = '';

  afterAll(async () => {
    if (ioServer) await new Promise<void>((r) => ioServer.close(() => r()));
  });

  async function start() {
    http = createServer();
    ioServer = new Server(http, { ...socketOriginOptions() });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  }

  function tryConnect(origin?: string): Promise<'connected' | 'rejected'> {
    const c = ioc(url, {
      transports: ['websocket'], forceNew: true, reconnection: false,
      extraHeaders: origin ? { Origin: origin } : {},
    });
    return new Promise((resolve) => {
      c.once('connect', () => { c.disconnect(); resolve('connected'); });
      c.once('connect_error', () => { c.disconnect(); resolve('rejected'); });
    });
  }

  it('外站 Origin 被拒,本机开发来源与无 Origin 放行', async () => {
    await start();
    expect(await tryConnect('https://evil.example')).toBe('rejected');
    expect(await tryConnect('http://localhost:5173')).toBe('connected');
    expect(await tryConnect()).toBe('connected');
  });
});

describe('clientIp', () => {
  const ctx = (headers: Record<string, string>, remote = '10.0.0.9') => ({
    req: { header: (k: string) => headers[k.toLowerCase()] },
    env: { incoming: { socket: { remoteAddress: remote } } },
  });

  it('pickForwardedFor 取倒数第 hops 个(客户端伪造的都在左边)', () => {
    expect(pickForwardedFor('6.6.6.6, 1.2.3.4', 1)).toBe('1.2.3.4');
    expect(pickForwardedFor('6.6.6.6, 1.2.3.4, 10.0.0.2', 2)).toBe('1.2.3.4');
    expect(pickForwardedFor('1.2.3.4', 3)).toBe('1.2.3.4');
    expect(pickForwardedFor('1.2.3.4', 0)).toBeNull();
    expect(pickForwardedFor(undefined, 1)).toBeNull();
  });

  it('本机默认不信任 XFF,用连接对端地址;伪造 XFF 换不了桶', () => {
    expect(clientIp(ctx({ 'x-forwarded-for': '6.6.6.6' }))).toBe('10.0.0.9');
    expect(clientIp(ctx({ 'x-forwarded-for': '7.7.7.7' }))).toBe('10.0.0.9');
  });

  it('hosted 默认信任一层代理:取代理追加的最后一项', () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(clientIp(ctx({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }))).toBe('1.2.3.4');
    expect(clientIp(ctx({ 'x-forwarded-for': '9.9.9.9, 1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('TRUST_PROXY_HOPS 可覆盖默认', () => {
    process.env.TRUST_PROXY_HOPS = '2';
    expect(clientIp(ctx({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4, 10.0.0.2' }))).toBe('1.2.3.4');
  });
});

describe('createRateLimiter 键清扫', () => {
  it('窗口过期的键会被扫掉,Map 不随 IP 数无限增长', () => {
    vi.useFakeTimers();
    try {
      const lim = createRateLimiter({ windowMs: 1000, max: 5 });
      for (let i = 0; i < 900; i++) lim.check(`ip-${i}`);
      expect(lim.size()).toBe(900);
      vi.advanceTimersByTime(2000);
      for (let i = 0; i < 200; i++) lim.check(`new-${i}`); // 第 1000 次检查触发清扫
      expect(lim.size()).toBeLessThan(300);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('POST /api/memory/forget 鉴权', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    memoryRoutes.request('/forget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('无 token、无 X-User-Id 的整库清空 → 403,不碰数据库', async () => {
    const res = await post({});
    expect(res.status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('按角色批量删(不限定用户)没有 token → 403', async () => {
    const res = await post({ archetype: 'contrarian' });
    expect(res.status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('自助删除只删 X-User-Id 本人;请求体里塞别人的 targetUserId 无效', async () => {
    const res = await post({ targetUserId: 'someone-else-0001', archetype: 'contrarian' }, { 'X-User-Id': 'me-abcdefgh1234' });
    expect(res.status).toBe(200);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('target_user_id');
    expect(queries[0].params).toContain('me-abcdefgh1234');
    expect(queries[0].params).not.toContain('someone-else-0001');
  });

  it('X-User-Id 格式不对 → 403', async () => {
    const res = await post({}, { 'X-User-Id': 'x' });
    expect(res.status).toBe(403);
  });

  it('未配置 MEMORY_ADMIN_TOKEN 时,带任何 token 都不算管理员', async () => {
    const res = await post({}, { 'X-Admin-Token': '' });
    expect(res.status).toBe(403);
    expect(adminTokenMatches('anything', undefined)).toBe(false);
    expect(adminTokenMatches('', '')).toBe(false);
  });

  it('正确的管理员 token 可整库清空(保留合规兜底能力)', async () => {
    process.env.MEMORY_ADMIN_TOKEN = 'admin-token-for-tests-0123456789';
    const wrong = await post({}, { 'X-Admin-Token': 'admin-token-for-tests-0123456788' });
    expect(wrong.status).toBe(403);
    const ok = await post({}, { 'X-Admin-Token': 'admin-token-for-tests-0123456789' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: 3, scope: 'global' });
  });
});

describe('POST /api/tts/generate 限流', () => {
  it('超出每小时额度 → 429 并给出 retryAfterSec', async () => {
    process.env.TTS_RATE_LIMIT_PER_HOUR = '2';
    const call = () => ttsRoutes.request('/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '收到' }),
    });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const third = await call();
    expect(third.status).toBe(429);
    const body = await third.json() as { error: string; retryAfterSec: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });
});
