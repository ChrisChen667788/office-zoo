/**
 * v6.168 — 托管版功能收口:收款 / B2B / 邮箱订阅接口在 hosted 下 404,本机自部署照常;
 * /api/config 下发同一份开关;示例对局接口。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { featureFlags, hostedFeatureGate } from '../hostedFeatures';
import { configRoutes } from '../../routes/config';
import { replayRoutes } from '../../routes/replay';

afterEach(() => { delete process.env.DEPLOY_PROFILE; });

function app() {
  const a = new Hono();
  a.use('*', hostedFeatureGate);
  a.all('*', (c) => c.json({ reached: true }));
  return a;
}

describe('hostedFeatureGate', () => {
  it('本机:全部放行', async () => {
    for (const p of ['/api/billing/config', '/api/b2b/configs', '/api/wrapped/subscribe', '/api/fired/scenarios']) {
      expect((await app().request(p)).status, p).toBe(200);
    }
    expect(featureFlags()).toEqual({ payments: true, b2b: true, wrappedEmail: true });
  });

  it('hosted:收款 / B2B / 邮箱订阅 404,其余照常', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    for (const [p, f] of [['/api/billing/checkout', 'payments'], ['/api/b2b/configs/abc', 'b2b'], ['/api/wrapped/subscribe', 'wrappedEmail'], ['/api/billing', 'payments']]) {
      const r = await app().request(p, { method: 'POST' });
      expect(r.status, p).toBe(404);
      expect(await r.json()).toEqual({ error: 'feature_disabled', feature: f });
    }
    expect((await app().request('/api/fired/scenarios')).status).toBe(200);
    expect((await app().request('/api/billingx')).status).toBe(200); // 只拦完整路径段
  });

  it('/api/config 下发开关', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const j = await (await configRoutes.request('/')).json() as { features: unknown };
    expect(j.features).toEqual({ payments: false, b2b: false, wrappedEmail: false });
  });
});

describe('GET /api/replay/samples', () => {
  it('返回数组(资产包里没有示例时为空);未知 sample id 404', async () => {
    const r = await replayRoutes.request('/samples');
    expect(r.status).toBe(200);
    const j = await r.json() as { samples: unknown[] };
    expect(Array.isArray(j.samples)).toBe(true);
    expect((await replayRoutes.request('/sample-0000000000000')).status).toBe(404);
  });
});
