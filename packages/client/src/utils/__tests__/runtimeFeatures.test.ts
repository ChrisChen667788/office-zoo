/**
 * v6.168 — 前端功能开关:配置到达前按关处理;老服务器(没有 features)= 历史行为全开。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRuntimeConfig, __resetRuntimeConfigForTest } from '../runtimeConfig';

beforeEach(() => { __resetRuntimeConfigForTest(); vi.restoreAllMocks(); });

describe('runtimeConfig.features', () => {
  it('托管版下发的开关原样生效', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ profile: 'hosted', features: { payments: false, b2b: false, wrappedEmail: false } })));
    const cfg = await getRuntimeConfig();
    expect(cfg.features).toEqual({ payments: false, b2b: false, wrappedEmail: false });
    expect(cfg.profile).toBe('hosted');
  });
  it('老服务器没有 features 字段 → 全开(本机自部署历史行为)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ profile: 'local' })));
    expect((await getRuntimeConfig()).features).toEqual({ payments: true, b2b: true, wrappedEmail: true });
  });
});
