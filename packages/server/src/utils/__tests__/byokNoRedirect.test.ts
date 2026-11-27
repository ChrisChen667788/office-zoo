/**
 * v6.169 — 带访客凭据的出站请求不跟随跳转。
 *
 * 自定义接口地址的 SSRF 校验只看第一跳的 DNS 解析;接口若回 30x 指向内网(云元数据等),默认的 fetch
 * 会跟过去。这里用两个真实的本机 HTTP 服务复现:A 对任何请求回 302 → B;B 记录有没有被访问到。
 * (不 mock fetch —— 要验证的正是 fetch 的真实跳转行为。)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ByokConfig } from '@furball/shared';
import { callLLMWithTimeout } from '../llm';
import { chatModel, noRedirectFetch, runWithAi } from '../aiClient';
import { fetchModelsAndContext } from '../capabilityProbe';

let internal: http.Server;
let redirector: http.Server;
let internalHits: Array<{ url: string; auth: string | undefined }> = [];
let redirectorHits = 0;
let base = '';

const listen = (srv: http.Server) => new Promise<number>((resolve) => {
  srv.listen(0, '127.0.0.1', () => resolve((srv.address() as AddressInfo).port));
});

beforeAll(async () => {
  internal = http.createServer((req, res) => {
    internalHits.push({ url: req.url ?? '', auth: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'secret-internal-model' }] }));
  });
  const internalPort = await listen(internal);
  redirector = http.createServer((req, res) => {
    redirectorHits++;
    req.resume();
    res.writeHead(307, { location: `http://127.0.0.1:${internalPort}/latest/meta-data/` });
    res.end();
  });
  base = `http://127.0.0.1:${await listen(redirector)}/v1`;
});

afterAll(async () => {
  await Promise.all([internal, redirector].map((s) => new Promise((r) => s.close(() => r(null)))));
});

beforeEach(() => { internalHits = []; redirectorHits = 0; });

const KEY = 'sk-visitor-0123456789abcdef';
const custom: ByokConfig = { v: 1, provider: 'custom', apiKey: KEY, model: 'm', baseURL: '' };

describe('访客凭据的出站请求不跟随跳转', () => {
  it('对照:默认的 fetch 会跟着 307 走到「内网」服务(说明这个夹具测得到跳转)', async () => {
    const r = await fetch(`${base}/models`);
    expect(r.ok).toBe(true);
    expect(internalHits).toHaveLength(1);
  });

  it('noRedirectFetch:遇到跳转直接失败,「内网」服务一次都没被访问', async () => {
    await expect(noRedirectFetch(`${base}/models`)).rejects.toBeTruthy();
    expect(redirectorHits).toBe(1);
    expect(internalHits).toHaveLength(0);
  });

  it('拉模型列表和窗口大小(/api/llm/check 的能力检测用):不跟随,返回空结果', async () => {
    expect(await fetchModelsAndContext(base, KEY, 'secret-internal-model')).toEqual({ ids: null, contextTokens: undefined });
    expect(redirectorHits).toBe(1);
    expect(internalHits).toHaveLength(0);
  });

  it('对话请求(自定义模型商):不跟随,调用失败,访客的 key 没有被带到跳转目标', async () => {
    const r = await runWithAi({ byok: { ...custom, baseURL: base } }, () =>
      callLLMWithTimeout('SPEECH', { model: chatModel('main', 'x'), prompt: 'hi', maxRetries: 0 }));
    expect(r.ok).toBe(false);
    expect(redirectorHits).toBeGreaterThan(0);
    expect(internalHits).toHaveLength(0);
  });
});
