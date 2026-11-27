// @vitest-environment jsdom
/**
 * v6.169.5 — 模型设置面板「保存并检测」流程(计划 2.3 与验收第 2、3、7 条)。
 * 仓库没有 @testing-library/react,用 react-dom/client 直接渲染;/api/config 与 /api/llm/check 都由假 fetch 回应。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import type { CapabilityItem, CapabilityReport } from '@furball/shared';

vi.mock('../../../utils/analytics', () => ({ trackEvent: () => {} }));

function report(overall: CapabilityReport['overall'], patch: Partial<Record<CapabilityItem['id'], Partial<CapabilityItem>>> = {}): CapabilityReport {
  const ids: CapabilityItem['id'][] = ['connect', 'roleplay', 'format', 'speed', 'concurrency', 'reasoning', 'context', 'tts'];
  const levels: Record<string, CapabilityItem['level']> = { connect: 'required', roleplay: 'required', format: 'required', tts: 'optional' };
  return {
    v: 1, overall, source: 'byok', provider: 'deepseek', model: 'deepseek-flash', checkedAt: Date.now(), totalMs: 900,
    items: ids.map((id) => ({ id, level: levels[id] ?? 'recommended', status: id === 'tts' ? 'skipped' : 'pass', ...patch[id] } as CapabilityItem)),
  };
}

let checkReply: () => { status: number; body: unknown };
let checkCalls = 0;

function installFetch() {
  window.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/config')) {
      return new Response(JSON.stringify({ profile: 'local', llm: { keyMode: 'server', customBaseUrl: true, serverKeyConfigured: false } }));
    }
    if (url.includes('/api/llm/check')) {
      checkCalls++;
      const r = checkReply();
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

let container: HTMLDivElement;
let root: Root;
let onSaved: ReturnType<typeof vi.fn<() => void>>;

async function fresh() {
  vi.resetModules();
  const Panel = (await import('../ModelSettingsPanel')).default;
  const byok = await import('../../../utils/byok');
  await (await import('../../../utils/runtimeConfig')).getRuntimeConfig();
  return { Panel, byok };
}

async function render(Panel: React.ComponentType<{ onSaved?: () => void; compact?: boolean }>) {
  await act(async () => { root.render(React.createElement(Panel, { onSaved })); });
  await flush();
}
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function type(id: string, value: string) {
  const el = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await flush();
}
async function click(id: string) {
  await act(async () => { q(id)!.click(); });
  await flush();
}

// Node 自带的 localStorage 与 jsdom 冲突(--localstorage-file 警告),换成内存版
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('localStorage', memoryStorage());
  checkCalls = 0;
  onSaved = vi.fn<() => void>();
  installFetch();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.removeChild(container);
});

describe('保存并检测', () => {
  it('key 错(连通没过):不保存,说明原因', async () => {
    checkReply = () => ({ status: 502, body: { ok: false, reason: 'key_rejected', capability: report('incomplete', { connect: { status: 'error', reason: 'key_rejected' } }) } });
    const { Panel, byok } = await fresh();
    await render(Panel);
    expect(q('byok-check')!.textContent).toBe('保存并检测');
    await type('byok-key', 'sk-wrong-key-000000');
    await click('byok-check');
    expect(checkCalls).toBe(1);
    expect(byok.getByok()).toBeNull();
    expect(q('byok-msg')!.textContent).toContain('没有保存');
    expect(q('capability-result')!.textContent).toContain('key 被模型商拒绝');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('全部通过:自动保存并关弹窗', async () => {
    checkReply = () => ({ status: 200, body: { ok: true, capability: report('pass') } });
    const { Panel, byok } = await fresh();
    await render(Panel);
    await type('byok-key', 'sk-good-key-000000');
    await click('byok-check');
    expect(byok.getByok()?.apiKey).toBe('sk-good-key-000000');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('只有推荐项提醒:保存,但不关弹窗,让人看完提醒', async () => {
    checkReply = () => ({ status: 200, body: { ok: true, capability: report('warn', { speed: { status: 'warn', reason: 'slow_speech' } }) } });
    const { Panel, byok } = await fresh();
    await render(Panel);
    await type('byok-key', 'sk-warn-key-000000');
    await click('byok-check');
    expect(byok.getByok()).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(q('byok-msg')!.textContent).toContain('提醒');
  });

  it('必需项不达标:不自动保存,不达标项写明是哪一项;点「仍然使用」才保存', async () => {
    checkReply = () => ({ status: 200, body: { ok: true, capability: report('fail', { roleplay: { status: 'fail', reason: 'refused' } }) } });
    const { Panel, byok } = await fresh();
    await render(Panel);
    await type('byok-key', 'sk-refuse-key-00000');
    await click('byok-check');
    expect(byok.getByok()).toBeNull();
    expect(q('capability-fail-list')!.textContent).toContain('不拒演:');
    expect(q('byok-save')!.textContent).toBe('仍然使用');
    await click('byok-save');
    expect(byok.getByok()?.apiKey).toBe('sk-refuse-key-00000');
    expect(checkCalls).toBe(1); // 「仍然使用」不再检测
  });

  it('检测接口自己限流(没有检测报告):不保存,告诉用户多久后再试', async () => {
    checkReply = () => ({ status: 429, body: { ok: false, reason: 'rate_limited', retryAfterSec: 42 } });
    const { Panel, byok } = await fresh();
    await render(Panel);
    await type('byok-key', 'sk-limited-key-0000');
    await click('byok-check');
    expect(byok.getByok()).toBeNull();
    expect(q('byok-msg')!.textContent).toContain('42 秒');
  });

  it('改了 key 之后,上一份配置的检测结果不再显示,按钮回到「保存并检测」', async () => {
    checkReply = () => ({ status: 200, body: { ok: true, capability: report('fail', { format: { status: 'fail', reason: 'format_broken' } }) } });
    const { Panel } = await fresh();
    await render(Panel);
    await type('byok-key', 'sk-first-key-000000');
    await click('byok-check');
    expect(q('capability-result')).not.toBeNull();
    await type('byok-key', 'sk-second-key-00000');
    expect(q('capability-result')).toBeNull();
    expect(q('byok-check')!.textContent).toBe('保存并检测');
    expect(q('byok-save')).toBeNull();
  });

  it('7 天内重开同一份配置:直接显示上次结果,不再调用检测;按钮是「已保存 / 重新检测」', async () => {
    checkReply = () => ({ status: 200, body: { ok: true, capability: report('pass') } });
    let { Panel } = await fresh();
    await render(Panel);
    await type('byok-key', 'sk-cached-key-00000');
    await click('byok-check');
    expect(checkCalls).toBe(1);
    // 关掉再打开(重新挂载;会话里的配置和缓存都还在)
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    ({ Panel } = await fresh());
    await render(Panel);
    expect(q('capability-result')?.getAttribute('data-cached')).toBe('1');
    expect(q('capability-cached')).not.toBeNull();
    expect(q('byok-save')!.textContent).toBe('已保存');
    expect(q('byok-check')!.textContent).toBe('重新检测');
    expect(checkCalls).toBe(1);
  });

  it('自定义地址末尾带 / :保存后显示「已保存」,重开命中缓存(和保存时用同一套规范化)', async () => {
    checkReply = () => ({ status: 200, body: { ok: true, capability: report('pass') } });
    let { Panel, byok } = await fresh();
    await render(Panel);
    const select = q('byok-provider') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(select, 'custom'); select.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    const base = container.querySelector('input[placeholder="https://your-llm.example.com/v1"]') as HTMLInputElement;
    const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { inputSetter.call(base, 'https://llm.example.com/v1/'); base.dispatchEvent(new Event('input', { bubbles: true })); });
    await flush();
    await type('byok-model', 'm1');
    await type('byok-key', 'sk-slash-key-000000');
    await click('byok-check');
    expect(byok.getByok()?.baseURL).toBe('https://llm.example.com/v1');
    // 同一次打开里:输入框仍是带 / 的写法,也要认出这就是刚存的那份
    expect(q('byok-save')!.textContent).toBe('已保存');
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    ({ Panel, byok } = await fresh());
    await render(Panel);
    expect(q('capability-result')?.getAttribute('data-cached')).toBe('1');
    expect(q('byok-save')!.textContent).toBe('已保存');
    expect(checkCalls).toBe(1);
  });
});
