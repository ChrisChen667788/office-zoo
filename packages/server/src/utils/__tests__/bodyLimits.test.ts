/**
 * v6.169 — 请求体大小上限:普通 API 超过 1MB → 413(路由不执行);转码接口放到 50MB;
 * 没有 Content-Length 的分块上传同样被截断。
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { API_BODY_LIMIT, TRANSCODE_PATH, applyBodyLimits } from '../bodyLimits';

function makeApp() {
  const app = new Hono();
  applyBodyLimits(app);
  const reached: string[] = [];
  app.post('/api/echo', async (c) => { reached.push('echo'); return c.json({ n: (await c.req.text()).length }); });
  app.post(TRANSCODE_PATH, async (c) => { reached.push('transcode'); return c.json({ n: (await c.req.arrayBuffer()).byteLength }); });
  return { app, reached };
}

const bytes = (n: number) => new Uint8Array(n).fill(97);

describe('applyBodyLimits', () => {
  it('普通 API:1MB 以内放行;超过 → 413,路由不执行', async () => {
    const { app, reached } = makeApp();
    const ok = await app.request('/api/echo', { method: 'POST', body: bytes(API_BODY_LIMIT), headers: { 'content-length': String(API_BODY_LIMIT) } });
    expect(ok.status).toBe(200);
    const big = await app.request('/api/echo', { method: 'POST', body: bytes(API_BODY_LIMIT + 1), headers: { 'content-length': String(API_BODY_LIMIT + 1) } });
    expect(big.status).toBe(413);
    expect(reached).toEqual(['echo']);
  });

  it('没有 Content-Length 的分块上传:边读边计数,超过同样 413', async () => {
    const { app } = makeApp();
    const stream = new ReadableStream({
      start(ctrl) { for (let i = 0; i < 3; i++) ctrl.enqueue(bytes(API_BODY_LIMIT / 2)); ctrl.close(); },
    });
    const res = await app.request('/api/echo', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(res.status).toBe(413);
  });

  it('转码接口单独放到 50MB:5MB 的视频能进到路由', async () => {
    const { app, reached } = makeApp();
    const n = 5 * 1024 * 1024;
    const res = await app.request(TRANSCODE_PATH, { method: 'POST', body: bytes(n), headers: { 'content-length': String(n), 'content-type': 'video/webm' } });
    expect(res.status).toBe(200);
    expect(reached).toEqual(['transcode']);
  });

  it('转码接口超过 50MB → 413(按 Content-Length 直接拒,不读进内存)', async () => {
    const { app, reached } = makeApp();
    const res = await app.request(TRANSCODE_PATH, { method: 'POST', body: bytes(16), headers: { 'content-length': String(51 * 1024 * 1024), 'content-type': 'video/webm' } });
    expect(res.status).toBe(413);
    expect(reached).toEqual([]);
  });
});
