// @vitest-environment jsdom
/**
 * v6.163 — 前端埋点:
 *  - 服务器没配 Umami → 不插入任何 <script>,事件直接丢弃
 *  - 配了 → 插入带 data-do-not-track 的脚本,加载后把排队的事件补发
 *  - 事件属性只留短字符串 / 数字 / 布尔;像密钥的值被丢掉(BYOK 后浏览器里有用户的 key)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeEventData, initAnalytics, trackEvent, __resetAnalyticsForTest, __analyticsStateForTest } from '../analytics';
import { __resetRuntimeConfigForTest } from '../runtimeConfig';

beforeEach(() => {
  __resetAnalyticsForTest();
  __resetRuntimeConfigForTest();
  document.head.innerHTML = '';
  delete (window as { umami?: unknown }).umami;
  vi.restoreAllMocks();
});

describe('sanitizeEventData', () => {
  it('丢掉像密钥的值、非法键、非原始值;截断长字符串', () => {
    const out = sanitizeEventData({
      mode: 'classic',
      rounds: 3,
      ok: true,
      key: 'sk-proj-abcdefghijklmnop',
      bearer: 'Bearer abc',
      token: 'A'.repeat(40),
      'Bad-Key': 'x',
      nested: undefined,
      long: '长'.repeat(100),
    });
    expect(out).toEqual({ mode: 'classic', rounds: 3, ok: true, long: '长'.repeat(64) });
  });
  it('全被过滤时返回 undefined', () => {
    expect(sanitizeEventData({ key: 'sk-abcdefghijk' })).toBeUndefined();
    expect(sanitizeEventData(undefined)).toBeUndefined();
  });
});

describe('initAnalytics', () => {
  it('服务器没配置 → 不插脚本,之后的事件直接丢弃', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ profile: 'hosted', analytics: { umami: null } })));
    trackEvent('game_start', { mode: 'classic' });
    await initAnalytics();
    expect(document.querySelectorAll('script').length).toBe(0);
    expect(__analyticsStateForTest()).toEqual({ state: 'disabled', queued: 0 });
    trackEvent('game_start', { mode: 'classic' });
    expect(__analyticsStateForTest().queued).toBe(0);
  });

  it('/api/config 拿不到 → 同样 no-op', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await initAnalytics();
    expect(document.querySelectorAll('script').length).toBe(0);
  });

  it('配置了 → 插入 Umami 脚本(尊重 DNT),加载后补发排队事件', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      profile: 'hosted',
      analytics: { umami: { scriptUrl: 'https://umami.example.com/script.js', websiteId: '3f2a9c1e-1b2c-4d5e-8f90-123456789abc' } },
    })));
    trackEvent('game_start', { mode: 'fired' });
    await initAnalytics();
    const s = document.querySelector('script')!;
    expect(s.src).toBe('https://umami.example.com/script.js');
    expect(s.dataset.websiteId).toBe('3f2a9c1e-1b2c-4d5e-8f90-123456789abc');
    expect(s.dataset.doNotTrack).toBe('true');
    const track = vi.fn();
    (window as { umami?: unknown }).umami = { track };
    s.onload?.(new Event('load'));
    expect(track).toHaveBeenCalledWith('game_start', { mode: 'fired' });
    trackEvent('video_export_clicked', { mode: 'talkshow' });
    expect(track).toHaveBeenLastCalledWith('video_export_clicked', { mode: 'talkshow' });
  });
});
