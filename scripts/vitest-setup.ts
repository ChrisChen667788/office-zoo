/**
 * v6.165 — 每个测试文件的前置:拦住一切对外网络请求。
 *
 * 曾经 imageGen / iconGen 顶部的 `import 'dotenv/config'` 会把开发者本机 .env 里的真实 key
 * 读进测试进程,测试于是真的拿用户的 key 调了外部生图 / 模型接口。现在两道防线:
 *   1. vitest.config.ts 的 test.env 把所有 key 类变量置空(dotenv 不覆盖已有值);
 *   2. 这里把 fetch 包一层:目标不是本机回环地址就直接抛错。需要模拟外部接口的测试照常
 *      vi.spyOn(globalThis, 'fetch') / vi.mock 即可(spy 包在这层外面)。
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const realFetch = globalThis.fetch;

if (realFetch) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let host = 'localhost';
    try { host = new URL(raw, 'http://localhost').hostname; } catch { /* 相对地址 */ }
    if (!LOOPBACK.has(host)) {
      return Promise.reject(new TypeError(`[test] blocked external fetch to ${host} — mock it instead`));
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
