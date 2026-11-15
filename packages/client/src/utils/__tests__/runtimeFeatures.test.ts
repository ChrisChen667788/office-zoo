/**
 * v6.168 — 前端功能开关:配置到达前按关处理;老服务器(没有 features)= 历史行为全开。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRuntimeConfig, premiumGate, __resetRuntimeConfigForTest, type RuntimeConfig } from '../runtimeConfig';

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

describe('premiumGate(Premium 场景的锁)', () => {
  const cfg = (payments: boolean) => ({ profile: payments ? 'local' : 'hosted', features: { payments, b2b: payments, wrappedEmail: payments } }) as unknown as RuntimeConfig;

  it('配置还没到:不知道有没有付费墙 → pending(不放行也不跳转)', () => {
    expect(premiumGate(true, false, null)).toBe('pending');
  });
  it('本机(有付费墙):非会员锁住;会员放行', () => {
    expect(premiumGate(true, false, cfg(true))).toBe('locked');
    expect(premiumGate(true, true, cfg(true))).toBe('open');
  });
  it('托管版(不收款,没有付费墙):Premium 场景直接可玩', () => {
    expect(premiumGate(true, false, cfg(false))).toBe('open');
  });
  it('普通场景、已是会员:配置没到也照常可选', () => {
    expect(premiumGate(false, false, null)).toBe('open');
    expect(premiumGate(undefined, false, null)).toBe('open');
    expect(premiumGate(true, true, null)).toBe('open');
  });
});
