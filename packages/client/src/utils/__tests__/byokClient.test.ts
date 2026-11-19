// @vitest-environment jsdom
/**
 * v6.167 — 前端 BYOK:key 只发给本站 /api/*;默认只存本标签页;服务端回馈转成事件;入口拦截。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BYOK_HEADER, decodeByok, type ByokConfig } from '@furball/shared';

/** 内存版 Storage:Node 25 自带实验性全局 localStorage 会盖住 jsdom 的实现,这里显式装一份。 */
class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(window, name, { value: new MemStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
}

const cfg: ByokConfig = { v: 1, provider: 'deepseek', apiKey: 'sk-client-0123456789abcdef', model: 'deepseek-flash' };

async function fresh() {
  vi.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  return {
    byok: await import('../byok'),
    setup: await import('../modelSetup'),
    runtime: await import('../runtimeConfig'),
  };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('shouldAttachByok', () => {
  it('只给同源 /api/* 加;外站、同源非 API、协议不同都不加', async () => {
    const { byok } = await fresh();
    const o = 'https://zoo.example.com';
    expect(byok.shouldAttachByok('/api/fired/chat', o)).toBe(true);
    expect(byok.shouldAttachByok('https://zoo.example.com/api/x', o)).toBe(true);
    expect(byok.shouldAttachByok('https://evil.example/api/x', o)).toBe(false);
    expect(byok.shouldAttachByok('http://zoo.example.com/api/x', o)).toBe(false);
    expect(byok.shouldAttachByok('/share/character/Tony', o)).toBe(false);
    expect(byok.shouldAttachByok('/apix', o)).toBe(false);
    expect(byok.shouldAttachByok('https://umami.example/script.js', o)).toBe(false);
  });
});

describe('存储', () => {
  it('默认只存本标签页;勾选记住改存 localStorage,两处只有一份;清除两处都清', async () => {
    const { byok } = await fresh();
    expect(byok.saveByok(cfg, false)).toBeNull();
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
    expect(byok.isRemembered()).toBe(false);
    byok.saveByok(cfg, true);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(1);
    expect(byok.isRemembered()).toBe(true);
    byok.clearByok();
    expect(sessionStorage.length + localStorage.length).toBe(0);
    expect(byok.getByok()).toBeNull();
  });

  it('不合法的配置不保存;存储里的坏数据当没有', async () => {
    const { byok } = await fresh();
    expect(byok.saveByok({ ...cfg, apiKey: 'x' }, false)).toBe('bad_key');
    expect(byok.getByok()).toBeNull();
    localStorage.setItem('office-zoo.byok.v1', '{"v":1,"provider":"evil"}');
    vi.resetModules();
    const again = await import('../byok');
    expect(again.getByok()).toBeNull();
  });
});

describe('fetch 拦截', () => {
  it('同源 /api/* 带上 X-Byok(内容可解码回原配置);外站请求不带;已有头不覆盖', async () => {
    const seen: Array<{ url: string; byok: string | null }> = [];
    window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      seen.push({ url, byok: new Headers(init?.headers).get(BYOK_HEADER) });
      return new Response('{}');
    }) as typeof fetch;
    const { byok } = await fresh();
    byok.installByokFetch();
    byok.saveByok(cfg, false);
    await fetch('/api/fired/chat', { method: 'POST' });
    await fetch('https://evil.example/api/steal');
    await fetch('/api/llm/check', { headers: { [BYOK_HEADER]: 'draft' } });
    expect(decodeByok(seen[0].byok)).toEqual(cfg);
    expect(seen[1].byok).toBeNull();
    expect(seen[2].byok).toBe('draft');
  });

  it('没配置时不加头;响应头 X-Llm-Error 转成事件', async () => {
    window.fetch = vi.fn(async () => new Response('{}', { headers: { 'X-Llm-Error': 'need_key, quota,bogus' } })) as typeof fetch;
    const { byok } = await fresh();
    byok.installByokFetch();
    const issues: string[] = [];
    byok.onLlmIssue((i) => issues.push(i));
    await fetch('/api/daily/me');
    // 响应头来的 need_key 降为轻提示(后台请求不该弹窗)
    expect(issues).toEqual(['need_key_hint', 'quota']);
  });
});

describe('requireModel', () => {
  it('托管版(keyMode=byok)且没配 key → 打开设置并返回 false;配好后放行', async () => {
    window.fetch = vi.fn(async () => new Response(JSON.stringify({ profile: 'hosted', llm: { keyMode: 'byok', customBaseUrl: false } }))) as typeof fetch;
    const { byok, setup, runtime } = await fresh();
    await runtime.getRuntimeConfig();
    expect(setup.requireModel('test')).toBe(false);
    byok.saveByok(cfg, false);
    setup.closeModelSetup();
    expect(setup.requireModel('test')).toBe(true);
  });

  it('本机 .env 模式(keyMode=server)不拦', async () => {
    window.fetch = vi.fn(async () => new Response(JSON.stringify({ profile: 'local', llm: { keyMode: 'server', customBaseUrl: true } }))) as typeof fetch;
    const { setup, runtime } = await fresh();
    await runtime.getRuntimeConfig();
    expect(setup.requireModel('test')).toBe(true);
  });
});
